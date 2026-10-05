import {requireCommercialFacts} from './commercial-facts.js';
import {lockRentalAvailability,requireRentalAvailability} from './availability.js';
import type pg from 'pg';
import {transition,listingTransitions} from '@haven/contracts';
import {event,type Actor} from '@haven/database';
import {fail} from '../platform/core.js';
export async function changeListingState(c:pg.PoolClient,a:Actor,id:string,input:{status:string;version:number;reason?:string;verified?:boolean}){
 const hint=(await c.query('SELECT unit_id,transaction FROM listings WHERE id=$1',[id])).rows[0];if(!hint)fail(404,'Property not found');if(hint.transaction==='rent')await lockRentalAvailability(c,hint.unit_id);
 const listing=(await c.query('SELECT * FROM listings WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!listing)fail(404,'Property not found');
 const reviewer=a.roles.some(role=>['moderator','admin'].includes(role)),manager=a.roles.some(role=>['agency_manager','admin'].includes(role));
 const assigned=listing.agent_id&&(await c.query('SELECT 1 FROM agents WHERE id=$1 AND user_id=$2',[listing.agent_id,a.id])).rowCount;
 if(!reviewer&&listing.owner_id!==a.id&&!(listing.organization_id===a.orgId&&(manager||assigned)))fail(404,'Assigned property not found');
 if(listing.unit_id!==hint.unit_id||listing.transaction!==hint.transaction)fail(409,'Property unit changed; reload before proceeding');
 if(listing.version!==input.version)fail(409,'This property changed; reload before proceeding');
 if(['under_review','published','rejected'].includes(input.status)&&!reviewer)fail(403,'A moderator must review publication decisions');
 if(input.status==='rejected'&&(!input.reason||input.reason.trim().length<5))fail(400,'Give a reason for rejecting this property');
 if(['published','rejected'].includes(input.status)&&(listing.created_by===a.id||listing.owner_id===a.id||assigned))fail(403,'You cannot approve or reject your own property');
 if(input.status==='sold'&&listing.transaction!=='sale'||input.status==='leased'&&listing.transaction!=='rent')fail(409,'Choose the completion state for this transaction type');
 transition(listingTransitions,listing.status,input.status);
 if(input.status==='published'){
  if(!input.verified)fail(400,'Confirm verified property facts and authority to list');
  const unit=(await c.query('SELECT area,beds,living_rooms,baths FROM units WHERE id=$1',[listing.unit_id])).rows[0];
  const approved=(await c.query("SELECT '/api/v1/media/'||a.id||'/view' AS url FROM listing_media lm JOIN media_assets a ON a.id=lm.asset_id WHERE lm.listing_id=$1 AND lm.kind='photo' AND lm.status='approved' AND a.status='approved' AND a.scan_at IS NOT NULL AND a.visibility='public' ORDER BY lm.position,lm.id",[id])).rows.map(row=>row.url);
  const fixturePhotos=listing.photos.filter((path:string)=>/^\/homes\/home-[1-6]\.jpg$/.test(path));
  const photos=[...new Set([...fixturePhotos,...approved])];
  if(listing.title.trim().length<8||listing.description.trim().length<20||!listing.price||Number(listing.price)<=0||!unit||!listing.agent_id||!photos.length)fail(400,'Publication requires complete facts, a positive price, an agent and approved photos');
  if(!(await c.query('SELECT 1 FROM agents WHERE id=$1 AND organization_id=$2 AND verified_until>=current_date',[listing.agent_id,listing.organization_id])).rowCount)fail(400,'Publication requires an eligible agent in the property organization');
  if(listing.segment==='commercial')await requireCommercialFacts(c,id);
  if(listing.transaction==='rent')await requireRentalAvailability(c,listing.unit_id,id);
  await c.query('UPDATE listings SET photos=$2,reviewed_by=$3,reviewed_at=now(),expires_at=NULL WHERE id=$1',[id,photos,a.id]);
 }
 const result=(await c.query("UPDATE listings SET status=$2,version=version+1,updated_at=now(),published_at=CASE WHEN $2='published' THEN now() ELSE published_at END WHERE id=$1 RETURNING id,status,version",[id,input.status])).rows[0];
 await c.query('INSERT INTO listing_status_history(listing_id,previous_status,next_status,actor_id,reason,listing_version) VALUES($1,$2,$3,$4,$5,$6)',[id,listing.status,input.status,a.id,input.reason?.trim()||null,result.version]);
 await event(c,a,id,'listing.'+input.status,{version:result.version});return result;
}
