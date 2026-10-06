import {createHash} from 'node:crypto';
import type pg from 'pg';
import {messageCreate} from '@haven/contracts';
import {event,type Actor} from '@haven/database';
import {transaction,data,fail} from '../platform/core.js';
import {conversationGrant} from './conversations.js';
async function records(c:pg.PoolClient,id:string,messageId?:string){return (await c.query(`SELECT m.id,m.conversation_id,m.sender_id,m.sequence::text,m.version,m.body,m.created_at,coalesce((SELECT jsonb_agg(jsonb_build_object('assetId',ma.asset_id,'version',ma.asset_version,'filename',cu.filename,'mime',cu.mime,'available',coalesce(a.status='approved' AND a.scan_at IS NOT NULL,false),'url',CASE WHEN a.status='approved' AND a.scan_at IS NOT NULL THEN '/api/v1/conversations/'||m.conversation_id||'/attachments/'||ma.asset_id ELSE NULL END) ORDER BY ma.position) FROM message_attachments ma JOIN conversation_uploads cu ON cu.asset_id=ma.asset_id LEFT JOIN media_assets a ON a.id=ma.asset_id WHERE ma.message_id=m.id),'[]') attachments FROM messages m WHERE m.conversation_id=$1 AND ($2::uuid IS NULL OR m.id=$2) ORDER BY m.sequence LIMIT 500`,[id,messageId??null])).rows;}
export async function readMessages(a:Actor,id:string){return transaction(a,async c=>{await conversationGrant(c,id);return data(await records(c,id));});}
export async function persistMessage(a:Actor,id:string,x:ReturnType<typeof messageCreate.parse>){return transaction(a,async c=>{
 await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['message:'+a.id+':'+x.clientId]);
 const thread=await conversationGrant(c,id,true),hash=createHash('sha256').update(JSON.stringify({conversationId:id,conversationVersion:x.conversationVersion,body:x.body,attachments:x.attachments})).digest('hex'),prior=(await c.query('SELECT * FROM messages WHERE sender_id=$1 AND client_id=$2',[a.id,x.clientId])).rows[0];
 if(prior){if(prior.conversation_id!==id||prior.request_hash!==null&&prior.request_hash!==hash||prior.request_hash===null&&(prior.body!==x.body||x.attachments.length))fail(409,'This client message ID was already used with different content','MESSAGE_ID_CONFLICT');return data((await records(c,id,prior.id))[0]);}
 if(thread.state!=='active')fail(409,'This conversation is read-only');if(thread.version!==x.conversationVersion)fail(409,'Conversation access changed; refresh before sending','CONVERSATION_CHANGED');
 // Recheck after the row lock, with the current statement snapshot.
 if(!(await c.query('SELECT conversation_scope($1) valid',[id])).rows[0].valid)fail(404,'Conversation access is no longer available');
 for(const item of [...x.attachments].sort((l,r)=>l.assetId.localeCompare(r.assetId))){const asset=(await c.query("SELECT a.id,a.version FROM media_assets a JOIN conversation_uploads cu ON cu.asset_id=a.id WHERE a.id=$1 AND a.owner_id=$2 AND cu.creator_id=$2 AND cu.conversation_id=$3 AND a.status='approved' AND a.scan_at IS NOT NULL AND a.visibility='private' FOR SHARE OF a",[item.assetId,a.id,id])).rows[0];if(!asset)fail(404,'Owned scanned attachment not found for this conversation');if(asset.version!==item.version)fail(409,'Attachment changed; select it again');}
 const saved=(await c.query('INSERT INTO messages(conversation_id,sender_id,client_id,sequence,body,request_hash,context_version) VALUES($1,$2,$3,(SELECT coalesce(max(sequence),0)+1 FROM messages WHERE conversation_id=$1),$4,$5,$6) RETURNING id',[id,a.id,x.clientId,x.body,hash,x.conversationVersion])).rows[0];
 for(const [position,item] of x.attachments.entries())await c.query('INSERT INTO message_attachments(message_id,asset_id,asset_version,position) VALUES($1,$2,$3,$4)',[saved.id,item.assetId,item.version,position]);
 await event(c,a,id,'message.persisted',{messageId:saved.id});return data((await records(c,id,saved.id))[0]);
 });}
