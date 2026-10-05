import type pg from 'pg';
import {z} from 'zod';
import {event} from '@haven/database';
import {listingFilters,priceLabel} from '@haven/contracts';
import {data,env,transaction,fail} from '../platform/core.js';
import {compileListingSearch} from '../geography/search.js';
import {normalizeSavedSearch,savedSearchCriteriaVersion} from './saved-searches.js';
import {createAlertMailSender,type MailSender} from './mail-sender.js';
export async function alertTransaction<T>(work:(c:pg.PoolClient)=>Promise<T>){return transaction(null,async c=>{await c.query("SELECT set_config('app.admin','true',true)");return work(c);});}
export async function alertUserLock(c:pg.PoolClient,id:string){await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['optional-alerts:'+id]);}
export function alertView(row:any){return {id:row.id,version:row.version,status:row.status,dueAt:new Date(row.due_at).toISOString(),attempts:row.attempts,acceptanceRecordedAt:row.acceptance_recorded_at?new Date(row.acceptance_recorded_at).toISOString():null,errorCode:row.error_code};}
function calendarPeriod(cadence:string,date=new Date()){const start=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()));if(cadence==='weekly')start.setUTCDate(start.getUTCDate()-(start.getUTCDay()+6)%7);const due=new Date(start);due.setUTCDate(due.getUTCDate()+(cadence==='weekly'?7:1));return {start,due};}
const frozen=z.object({messageId:z.string(),email:z.string().nullable(),emailAllowed:z.boolean(),inAppAllowed:z.boolean(),subject:z.string(),text:z.string(),link:z.string(),items:z.array(z.object({id:z.uuid(),version:z.number().int().positive()})).min(1).max(50)});
type Frozen=z.infer<typeof frozen>;
export class AlertService{
 constructor(private readonly mail:MailSender=createAlertMailSender(),private readonly afterAcceptance?:()=>Promise<void>){}
 async confirmInquiry(eventId:string){return alertTransaction(async c=>{
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['transactional-mail:'+eventId]);
  const source=(await c.query("SELECT * FROM outbox WHERE id=$1 AND kind='inquiry.submitted'",[eventId])).rows[0];if(!source)fail(404,'Inquiry event not found');
  const previous=(await c.query("SELECT email_status FROM notifications WHERE source_event_id=$1",[eventId])).rows[0];if(previous?.email_status==='accepted')return data({accepted:true});
  const lead=(await c.query('SELECT user_id,email FROM leads WHERE id=$1',[source.aggregate_id])).rows[0];if(!lead)fail(404,'Inquiry not found');
  const messageId=eventId+'@haven.local',receipt=await this.mail.lookup(messageId)||await this.mail.send({messageId,to:lead.email,subject:'Your Haven inquiry has been received',text:'Your inquiry is saved. Your property team can now follow up. Reference: '+source.aggregate_id});
  await c.query("INSERT INTO notifications(user_id,title,body,source_event_id,email_status,provider_message_id,acceptance_recorded_at) VALUES($1,'Inquiry received','Your property team can now follow up.',$2,'accepted',$3,now()) ON CONFLICT(source_event_id) DO UPDATE SET email_status='accepted',provider_message_id=EXCLUDED.provider_message_id,acceptance_recorded_at=EXCLUDED.acceptance_recorded_at,version=notifications.version+1",[lead.user_id,eventId,receipt.messageId]);
  await event(c,null,source.aggregate_id,'notification.inquiry_accepted',{service:'notifications',sourceEventId:eventId});return data({accepted:true});
 });}
 async plan(eventId:string,listingVersion:number){return alertTransaction(async c=>{
  const source=(await c.query('SELECT * FROM outbox WHERE id=$1',[eventId])).rows[0];if(!source||source.kind!=='listing.published')fail(404,'Publication event not found');
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['notification-plan:'+eventId]);const existing=(await c.query('SELECT planned_count FROM alert_plan_events WHERE event_id=$1',[eventId])).rows[0];if(existing)return data({planned:existing.planned_count,replayed:true});
  const base=(await c.query('SELECT version FROM listings WHERE id=$1',[source.aggregate_id])).rows[0];if(!base||base.version!==listingVersion)fail(409,'Publication changed; refresh the job.','VERSION_CONFLICT');const listing=(await c.query('SELECT * FROM public_listings WHERE id=$1',[source.aggregate_id])).rows[0];let planned=0;
  if(listing){const searches=(await c.query("SELECT s.* FROM saved_searches s JOIN profiles p ON p.id=s.user_id JOIN notification_preferences n ON n.user_id=s.user_id WHERE s.criteria_version=$1 AND NOT s.paused AND s.deleted_at IS NULL AND p.state='active' AND (n.email_enabled OR n.in_app_enabled) AND s.created_at<=$2 ORDER BY s.user_id,s.id",[savedSearchCriteriaVersion,listing.publishedAt])).rows;
   for(const search of searches){await alertUserLock(c,search.user_id);const preferences=(await c.query('SELECT * FROM notification_preferences WHERE user_id=$1',[search.user_id])).rows[0];if(!preferences||!preferences.email_enabled&&!preferences.in_app_enabled)continue;
    const current=(await c.query('SELECT * FROM saved_searches WHERE id=$1 AND NOT paused AND deleted_at IS NULL FOR SHARE',[search.id])).rows[0];if(!current||current.criteria_version!==savedSearchCriteriaVersion)continue;
    let criteria;try{criteria=await normalizeSavedSearch(c,current.filters);}catch(error){if((error as {getStatus?:()=>number}).getStatus?.()===400)continue;throw error;}
    const compiled=compileListingSearch(listingFilters.parse(criteria)),values=[...compiled.values,listing.id];if(!(await c.query(`SELECT 1 FROM public_listings WHERE ${compiled.where} AND id=$${values.length}`,values)).rowCount)continue;
    if((await c.query('SELECT 1 FROM alert_digest_items WHERE search_id=$1 AND listing_id=$2',[search.id,listing.id])).rowCount)continue;
    let period=calendarPeriod(current.cadence),digest:any,slotFound=false;
    for(let offset=0;offset<32;offset++){digest=(await c.query('SELECT * FROM alert_digests WHERE search_id=$1 AND cadence=$2 AND period_start=$3 FOR UPDATE',[search.id,current.cadence,period.start.toISOString().slice(0,10)])).rows[0];if(!digest||digest.status==='queued'&&digest.attempts===0&&digest.search_version===current.version&&(await c.query('SELECT count(*)::int n FROM alert_digest_items WHERE digest_id=$1',[digest.id])).rows[0].n<50){slotFound=true;break;}period=calendarPeriod(current.cadence,period.due);digest=null;}
    if(!slotFound)fail(503,'Alert scheduling capacity is temporarily unavailable.','ALERT_CAPACITY');
    if(!digest)digest=(await c.query('INSERT INTO alert_digests(user_id,search_id,search_version,cadence,period_start,due_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(search_id,cadence,period_start) DO UPDATE SET updated_at=alert_digests.updated_at RETURNING *',[search.user_id,search.id,current.version,current.cadence,period.start.toISOString().slice(0,10),period.due])).rows[0];
    const inserted=await c.query('INSERT INTO alert_digest_items(search_id,listing_id,digest_id,listing_version) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[search.id,listing.id,digest.id,listing.version]);if(inserted.rowCount){await c.query('UPDATE alert_digests SET version=version+1,updated_at=now() WHERE id=$1',[digest.id]);await event(c,null,digest.id,'notification.digest_ready',{service:'notifications',dueAt:period.due.toISOString()});planned++;}
   }
  }
  await c.query('INSERT INTO alert_plan_events(event_id,planned_count) VALUES($1,$2)',[eventId,planned]);await event(c,null,eventId,'notification.publication_planned',{service:'notifications',planned,listingVersion});return data({planned,replayed:false});
 });}
 async due(){return alertTransaction(async c=>data((await c.query("SELECT * FROM alert_digests WHERE due_at<=now() AND ((status IN('queued','failed') AND attempts<5) OR (status='processing' AND updated_at<now()-interval '30 seconds')) ORDER BY due_at,id LIMIT 20")).rows.map(alertView)));}
 async read(id:string){return alertTransaction(async c=>{const row=(await c.query('SELECT * FROM alert_digests WHERE id=$1',[id])).rows[0];if(!row)fail(404,'Alert digest not found');return data(alertView(row));});}
 private async context(c:pg.PoolClient,row:any){const search=(await c.query('SELECT * FROM saved_searches WHERE id=$1',[row.search_id])).rows[0],profile=(await c.query('SELECT state,email,email_verified FROM profiles WHERE id=$1',[row.user_id])).rows[0],preferences=(await c.query('SELECT * FROM notification_preferences WHERE user_id=$1',[row.user_id])).rows[0];if(!search||search.paused||search.deleted_at||search.version!==row.search_version||search.criteria_version!==savedSearchCriteriaVersion||profile?.state!=='active'||!preferences||!preferences.email_enabled&&!preferences.in_app_enabled)return null;
  let filters;try{filters=await normalizeSavedSearch(c,search.filters);}catch(error){if((error as {getStatus?:()=>number}).getStatus?.()===400)return null;throw error;}const compiled=compileListingSearch(listingFilters.parse(filters)),values=[...compiled.values,row.id];const listings=(await c.query(`SELECT p.* FROM public_listings p JOIN alert_digest_items i ON i.listing_id=p.id WHERE ${compiled.where} AND i.digest_id=$${values.length} AND p.version=i.listing_version ORDER BY i.listing_id LIMIT 50`,values)).rows;return {search,profile,preferences,listings};
 }
 private async cancelled(c:pg.PoolClient,row:any,reason:string){const next=(await c.query("UPDATE alert_digests SET status='cancelled',version=version+1,error_code=$2,updated_at=now() WHERE id=$1 RETURNING *",[row.id,reason])).rows[0];await event(c,null,row.id,'notification.alert_cancelled',{service:'notifications',reason,version:next.version});return data(alertView(next));}
 async deliver(id:string,version:number){
  // Freeze the attempt before external I/O. A crash cannot make the batch mutable again.
  const prepared=await alertTransaction(async c=>{const found=(await c.query('SELECT * FROM alert_digests WHERE id=$1',[id])).rows[0];if(!found)fail(404,'Alert digest not found');await alertUserLock(c,found.user_id);const row=(await c.query('SELECT * FROM alert_digests WHERE id=$1 FOR UPDATE',[id])).rows[0];if(row.version!==version)fail(409,'Alert digest changed; refresh the job.','VERSION_CONFLICT');if(['accepted','in_app','cancelled'].includes(row.status)||new Date(row.due_at).getTime()>Date.now()||row.status==='processing'&&new Date(row.updated_at).getTime()>Date.now()-30000)return {terminal:data(alertView(row))};if(row.attempts>=5)return row.status==='processing'?{version:row.version,reconcileOnly:true}:{terminal:data(alertView(row))};
   let payload:Frozen;if(row.payload)payload=frozen.parse(row.payload);else{const context=await this.context(c,row);if(!context?.listings.length)return {terminal:await this.cancelled(c,row,'NOT_ELIGIBLE')};const {search,profile,preferences,listings}=context,emailAllowed=preferences.email_enabled&&profile.email_verified===true&&z.email().safeParse(profile.email).success;
    if(!emailAllowed&&!preferences.in_app_enabled)return {terminal:await this.cancelled(c,row,'EMAIL_VERIFICATION_REQUIRED')};
    const lines=listings.map(listing=>`${listing.title}\n${priceLabel(listing.price,listing.currency,listing.rentPeriod)}\n${env.PUBLIC_WEB_URL}/${listing.city}/${listing.segment==='commercial'?'commercial':listing.transaction==='rent'?'rent':'buy'}/${listing.slug}`);
    payload={messageId:'alert-'+row.id+'@'+new URL(env.PUBLIC_WEB_URL).hostname,email:emailAllowed?profile.email:null,emailAllowed,inAppAllowed:preferences.in_app_enabled,subject:'New homes for '+search.name,text:`${listings.length} current homes match your saved search "${search.name}".\n\n${lines.join('\n\n')}\n\nManage or pause this search: ${env.PUBLIC_WEB_URL}/account/searches\nManage optional alerts: ${env.PUBLIC_WEB_URL}/account/notifications`,link:'/account/searches',items:listings.map(listing=>({id:listing.id,version:listing.version}))};}
   const next=(await c.query("UPDATE alert_digests SET status='processing',payload=$2,attempts=attempts+1,version=version+1,error_code=NULL,updated_at=now() WHERE id=$1 RETURNING *",[id,payload])).rows[0];await event(c,null,id,'notification.alert_attempt_started',{service:'notifications',version:next.version,attempt:next.attempts});return {version:next.version};
  });if(prepared.terminal)return prepared.terminal;
  return alertTransaction(async c=>{const found=(await c.query('SELECT * FROM alert_digests WHERE id=$1',[id])).rows[0];await alertUserLock(c,found.user_id);const row=(await c.query('SELECT * FROM alert_digests WHERE id=$1 FOR UPDATE',[id])).rows[0];if(row.version!==prepared.version)fail(409,'Alert digest changed; refresh the job.','VERSION_CONFLICT');const payload=frozen.parse(row.payload);
   let acceptance;try{acceptance=payload.emailAllowed?await this.mail.lookup(payload.messageId):null;}catch{return this.failed(c,row,'MAIL_LOOKUP_UNCONFIRMED');}
   const context=await this.context(c,row),currentIds=new Set(context?.listings.map(listing=>listing.id));
   if(!acceptance&&(!context||payload.items.some(item=>!currentIds.has(item.id))))return this.cancelled(c,row,'NOT_ELIGIBLE');
   const emailAllowed=payload.emailAllowed&&context?.preferences.email_enabled&&context.profile.email_verified===true&&context.profile.email===payload.email;
   const inAppAllowed=payload.inAppAllowed&&context?.preferences.in_app_enabled;
   if(!acceptance&&!emailAllowed&&!inAppAllowed)return this.cancelled(c,row,'OPTED_OUT');
   if(inAppAllowed)await c.query('INSERT INTO notifications(user_id,title,body,alert_digest_id) VALUES($1,$2,$3,$4) ON CONFLICT(alert_digest_id) DO NOTHING',[row.user_id,payload.subject,`${payload.items.length} homes matched your saved search. Open saved searches to review current availability.`,id]);
   if(!acceptance&&prepared.reconcileOnly)return this.failed(c,row,'RETRY_LIMIT_REACHED');
   if(!acceptance&&emailAllowed){try{acceptance=await this.mail.send({messageId:payload.messageId,to:payload.email!,subject:payload.subject,text:payload.text});}catch{return this.failed(c,row,'MAIL_SEND_UNCONFIRMED');}}
   if(acceptance)await this.afterAcceptance?.();
   const status=acceptance?'accepted':'in_app',next=(await c.query('UPDATE alert_digests SET status=$2,provider_message_id=$3,acceptance_recorded_at=CASE WHEN $2=\'accepted\' THEN now() ELSE NULL END,version=version+1,error_code=NULL,updated_at=now() WHERE id=$1 RETURNING *',[id,status,acceptance?.messageId||null])).rows[0];await event(c,null,id,'notification.alert_'+status,{service:'notifications',version:next.version});return data(alertView(next));
  });
 }
 private async failed(c:pg.PoolClient,row:any,code:string){const next=(await c.query("UPDATE alert_digests SET status='failed',error_code=$2,due_at=now()+($3::int*interval '1 second'),version=version+1,updated_at=now() WHERE id=$1 RETURNING *",[row.id,code,Math.min(300,5*2**(row.attempts-1))])).rows[0];await event(c,null,row.id,'notification.alert_retry_pending',{service:'notifications',version:next.version,attempt:next.attempts});return data(alertView(next));}
}
