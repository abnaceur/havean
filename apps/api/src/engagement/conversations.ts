import {Controller,Get,Patch,Body,Req,Param,Inject} from '@nestjs/common';
import type {FastifyRequest} from 'fastify';
import type pg from 'pg';
import {z} from 'zod';
import {readCursorUpdate} from '@haven/contracts';
import type {Actor} from '@haven/database';
import {Identity,transaction,data,fail} from '../platform/core.js';
export async function conversationGrant(c:pg.PoolClient,id:string,lock=false){z.uuid().parse(id);const row=(await c.query('SELECT * FROM conversations WHERE id=$1 AND conversation_scope(id)'+(lock?' FOR UPDATE':''),[id])).rows[0];if(!row)fail(404,'Conversation not found for this account','CONVERSATION_UNAVAILABLE');return row;}
export async function authorizedConversation(a:Actor,id:string){return transaction(a,c=>conversationGrant(c,id));}
@Controller('api/v1')
export class ConversationsController{
 constructor(@Inject(Identity) private readonly identity:Identity){}
 @Get('conversations/:id/read-cursor') async cursor(@Req() req:FastifyRequest,@Param('id') id:string){const a=await this.identity.actor(req);return transaction(a,async c=>{await conversationGrant(c,id);return data((await c.query('SELECT sequence::text,version FROM conversation_read_cursors WHERE conversation_id=$1 AND user_id=$2',[id,a.id])).rows[0]??{sequence:'0',version:0});});}
 @Patch('conversations/:id/read-cursor') async read(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){const a=await this.identity.actor(req),x=readCursorUpdate.parse(body);return transaction(a,async c=>{
  await conversationGrant(c,id,true);const prior=(await c.query('SELECT sequence::text,version FROM conversation_read_cursors WHERE conversation_id=$1 AND user_id=$2 FOR UPDATE',[id,a.id])).rows[0];
  if(prior?.sequence===x.sequence)return data(prior);
  if((prior?.version??0)!==x.version||BigInt(x.sequence)<BigInt(prior?.sequence??'0'))fail(409,'Read state changed; refresh and retry','READ_CURSOR_CHANGED');
  if(x.sequence!=='0'&&!(await c.query('SELECT 1 FROM messages WHERE conversation_id=$1 AND sequence=$2',[id,x.sequence])).rowCount)fail(422,'Read state must reference a saved message');
  return data((await c.query('INSERT INTO conversation_read_cursors(conversation_id,user_id,sequence) VALUES($1,$2,$3) ON CONFLICT(conversation_id,user_id) DO UPDATE SET sequence=EXCLUDED.sequence,version=conversation_read_cursors.version+1,updated_at=now() RETURNING sequence::text,version',[id,a.id,x.sequence])).rows[0]);
 });}
 @Get('conversations/:id') async detail(@Req() req:FastifyRequest,@Param('id') id:string){const a=await this.identity.actor(req);return transaction(a,async c=>{const row=await conversationGrant(c,id),members=(await c.query('SELECT cm.user_id,cm.kind,cm.status,p.display_name FROM conversation_members cm JOIN profiles p ON p.id=cm.user_id WHERE cm.conversation_id=$1 AND cm.status=\'active\' ORDER BY cm.kind,cm.user_id',[id])).rows;return data({...row,members});});}
}
