import {requireOwnerGrant} from './owner-grants.js';
import type pg from 'pg';
import {event,type Actor} from '@haven/database';
import {fail} from '../platform/core.js';
import {digitizationUnitFactsChange} from '@haven/contracts';
import type {z} from 'zod';
type Changes={title:string;price:string;version:number;reason?:string;description?:string;features?:string[];furnishing?:string;availableFrom?:string|null;unitFacts?:z.infer<typeof digitizationUnitFactsChange>};
async function assigned(c:pg.PoolClient,a:Actor,listing:any){return Boolean(listing.agent_id&&(await c.query('SELECT 1 FROM agents WHERE id=$1 AND user_id=$2',[listing.agent_id,a.id])).rowCount);}
export async function submitListingRevision(c:pg.PoolClient,a:Actor,id:string,input:Changes){
 const listing=(await c.query('SELECT * FROM listings WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!listing)fail(404,'Property not found');
 const owner=listing.owner_id===a.id;if(owner)await requireOwnerGrant(c,a,listing.unit_id);else if(!a.roles.some(role=>['agent','agency_manager','admin'].includes(role)))fail(403,'Assigned property authors must propose these revisions');
 if(!owner&&!a.roles.includes('admin')&&(listing.organization_id!==a.orgId||!a.roles.includes('agency_manager')&&!(await assigned(c,a,listing))))fail(404,'Assigned property not found');
 if(listing.version!==input.version)fail(409,'This property changed; reload before proposing changes');
 if(listing.status!=='published')fail(409,'Only published properties accept pending revisions');
 if(!/^\d+(\.\d{1,2})?$/.test(input.price)||!/[1-9]/.test(input.price))fail(400,'Use a positive decimal asking price');
 if(!input.reason||input.reason.trim().length<5)fail(400,'Give a reason for the proposed changes');
 if((await c.query("SELECT 1 FROM listing_revisions WHERE listing_id=$1 AND status='pending'",[id])).rowCount)fail(409,'This property already has a pending revision');
 const row=(await c.query('INSERT INTO listing_revisions(listing_id,actor_id,changes,base_version,proposed_price) VALUES($1,$2,$3,$4,$5) RETURNING id,status,version',[id,a.id,JSON.stringify(input),input.version,input.price])).rows[0];
 await event(c,a,id,'listing.revision_submitted',{revisionId:row.id,version:listing.version});return row;
}
export async function decideListingRevision(c:pg.PoolClient,a:Actor,id:string,input:{status:'approved'|'rejected';version:number;reason:string;verified?:boolean}){
 if(!a.roles.some(role=>['moderator','admin'].includes(role)))fail(403,'A moderator must decide publication revisions');
 // Lock the listing before its revisions consistently with revision creation.
 const reference=(await c.query('SELECT listing_id,changes FROM listing_revisions WHERE id=$1',[id])).rows[0];if(!reference)fail(404,'Pending revision not found');
 // Shared physical units must serialize before any individual mandate listing.
 if(reference.changes.unitFacts&&input.status==='approved'){
  digitizationUnitFactsChange.parse(reference.changes.unitFacts);
  if(!(await c.query('SELECT digitization_inventory_review_unit_lock($1) id',[id])).rows[0].id)fail(409,'The private unit proposal is no longer current.');
 }
 const listing=(await c.query('SELECT * FROM listings WHERE id=$1 FOR UPDATE',[reference.listing_id])).rows[0];if(!listing)fail(404,'Property not found');
 const revision=(await c.query('SELECT * FROM listing_revisions WHERE id=$1 FOR UPDATE',[id])).rows[0];
 if(revision.status!=='pending'||revision.version!==input.version)fail(409,'This revision changed; reload before deciding');
 if(revision.actor_id===a.id||listing.owner_id===a.id||await assigned(c,a,listing))fail(403,'You cannot review your own property revision');
 if(input.reason.trim().length<5)fail(400,'Give a reason for the revision decision');
 if(input.status==='approved'){
  if(!input.verified)fail(400,'Confirm the revised facts and authority to list');
  if(listing.status!=='published'||listing.version!==revision.base_version)fail(409,'The public property changed after this revision was proposed');
  if(revision.actor_id===listing.owner_id&&!(await c.query("SELECT 1 FROM owner_unit_grants WHERE unit_id=$1 AND owner_id=$2 AND status='active' AND (expires_at IS NULL OR expires_at>now()) FOR SHARE",[listing.unit_id,listing.owner_id])).rowCount)fail(409,'Owner authority changed after this proposal. Recheck it before approval.');
  const changes={...revision.changes,price:revision.proposed_price??revision.changes.price} as Changes;
  if(changes.unitFacts){
   const siblings=(await c.query('SELECT listing_id FROM digitization_apply_inventory_unit($1,$2,$3)',[id,input.version,input.verified])).rows;
   for(const sibling of siblings)await event(c,a,sibling.listing_id,'listing.revision_approved',{unitFactsChanged:true});
  }
  const priceChanged=(await c.query('SELECT $1::numeric IS DISTINCT FROM $2::numeric changed',[listing.price,changes.price])).rows[0].changed;
  await c.query('UPDATE listings SET title=$2,price=$3,description=coalesce($4,description),features=coalesce($5,features),furnishing=coalesce($6,furnishing),available_from=CASE WHEN $7 THEN $8::date ELSE available_from END,version=version+1,updated_at=now(),reviewed_by=$9,reviewed_at=now() WHERE id=$1',[listing.id,changes.title,changes.price,changes.description??null,changes.features??null,changes.furnishing??null,Object.hasOwn(changes,'availableFrom'),changes.availableFrom??null,a.id]);
  if(priceChanged)await c.query('INSERT INTO listing_price_history(listing_id,revision_id,previous_price,next_price,currency,actor_id,private_reason) VALUES($1,$2,$3,$4,$5,$6,$7)',[listing.id,id,listing.price,changes.price,listing.currency,a.id,changes.reason||input.reason]);
 }
 await c.query('UPDATE listing_revisions SET status=$2,version=version+1,reviewed_by=$3,review_reason=$4,reviewed_at=now() WHERE id=$1',[id,input.status,a.id,input.reason]);
 await event(c,a,listing.id,'listing.revision_'+input.status,{revisionId:id});return{approved:input.status==='approved'};
}
