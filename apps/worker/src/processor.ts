import nodemailer from 'nodemailer';
import {pool,transaction} from '@haven/database';
import {config} from '@haven/config';
import {listingSearchSettings,publicListingSearchDocument} from '@haven/contracts';
export const workerActor={id:'00000000-0000-4000-8000-000000000010',orgId:null,roles:['admin']};
export type FaultPoint='after-search'|'after-mail'|'before-commit';
export type ProcessorOptions={afterEffect?:(point:FaultPoint)=>Promise<void>;searchUrl?:string;mailApiUrl?:string;mailHost?:string;mailPort?:number};
export async function searchTask(path:string,method:string,body?:unknown,searchUrl=config().SEARCH_URL){
 const env=config();const r=await fetch(searchUrl+path,{method,headers:{Authorization:'Bearer '+env.SEARCH_KEY,'Content-Type':'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('SEARCH_REQUEST_FAILED_'+r.status);
 const task=await r.json() as {taskUid:number};
 for(let i=0;i<100;i++){
  const response=await fetch(searchUrl+'/tasks/'+task.taskUid,{headers:{Authorization:'Bearer '+env.SEARCH_KEY},signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error('SEARCH_TASK_UNAVAILABLE');
  const status=await response.json() as {status:string;error?:{code:string}};
  if(status.status==='succeeded')return;if(status.status==='failed')throw Error('SEARCH_TASK_FAILED_'+status.error?.code);
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 throw Error('SEARCH_TASK_TIMEOUT');
}
export async function initializeSearch(){
 const env=config(),index=await fetch(env.SEARCH_URL+'/indexes/listings',{headers:{Authorization:'Bearer '+env.SEARCH_KEY},signal:AbortSignal.timeout(5000)});
 await searchTask(index.ok?'/indexes/listings':'/indexes',index.ok?'PATCH':'POST',index.ok?{primaryKey:'id'}:{uid:'listings',primaryKey:'id'});
 await searchTask('/indexes/listings/settings','PATCH',listingSearchSettings);
}
export function createProcessor(options:ProcessorOptions={}){
 const env=config(),mailApi=options.mailApiUrl||process.env.MAIL_API_URL||'http://mail:8025';
 const transport=nodemailer.createTransport({host:options.mailHost||'mail',port:options.mailPort||1025,secure:false});
 return async(job:{data:{id:string}})=>transaction(workerActor,async c=>{
  const id=job.data.id;
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[id]);
  const row=(await c.query('SELECT * FROM outbox WHERE id=$1 AND processed_at IS NULL FOR UPDATE',[id])).rows[0];if(!row)return;
  // Serialize projections per aggregate across all worker processes, including replay.
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['aggregate:'+row.aggregate_id]);
  let version:number|undefined;
  if(row.kind.startsWith('listing.')||row.kind.startsWith('property.')){
   await c.query("SELECT pg_advisory_xact_lock_shared(hashtextextended('listings-search-rebuild',0))");
   const current=(await c.query('SELECT version,status FROM listings WHERE id=$1',[row.aggregate_id])).rows[0];
   if(current){
    version=current.version;
    const prior=(await c.query("SELECT source_version FROM projection_versions WHERE aggregate_id=$1 AND projection='listings'",[row.aggregate_id])).rows[0];
    if(!prior||prior.source_version<=version!){
     const publicDoc=(await c.query('SELECT * FROM public_listings WHERE id=$1',[row.aggregate_id])).rows[0];
     await searchTask('/indexes/listings/documents'+(publicDoc?'':'/'+row.aggregate_id),publicDoc?'PUT':'DELETE',publicDoc?[publicListingSearchDocument(publicDoc)]:undefined,options.searchUrl||env.SEARCH_URL);
     await options.afterEffect?.('after-search');
     await c.query("INSERT INTO projection_versions(aggregate_id,projection,source_version,tombstone) VALUES($1,'listings',$2,$3) ON CONFLICT(aggregate_id,projection) DO UPDATE SET source_version=EXCLUDED.source_version,tombstone=EXCLUDED.tombstone,updated_at=now()",[row.aggregate_id,version,!publicDoc]);
    }
   }
  }
  if(row.kind==='inquiry.submitted'){
   const lead=(await c.query('SELECT user_id,email FROM leads WHERE id=$1',[row.aggregate_id])).rows[0];
   if(lead){
    // The development mail adapter reconciles delivery by stable Message-ID after a crash.
    // Production providers must implement the same idempotent delivery contract.
    const messageId=id+'@haven.local',found=await fetch(mailApi+'/api/v1/search?query='+encodeURIComponent('message-id:'+messageId),{signal:AbortSignal.timeout(5000)});
    if(!found.ok)throw Error('MAIL_RECONCILIATION_UNAVAILABLE');
    const existing=await found.json() as {messages_count:number};
    if(!existing.messages_count)await transport.sendMail({from:'Haven <notifications@example.test>',to:lead.email,subject:'Your Haven inquiry has been received',text:'Your inquiry is saved. Your property team can now follow up. Reference: '+row.aggregate_id,messageId:'<'+messageId+'>'});
    await options.afterEffect?.('after-mail');
    await c.query("INSERT INTO notifications(user_id,title,body,source_event_id) VALUES($1,'Inquiry received','Your property team can now follow up.',$2) ON CONFLICT(source_event_id) DO NOTHING",[lead.user_id,id]);
   }
  }
  await c.query("INSERT INTO outbox_effects(event_id,consumer,source_version) VALUES($1,'platform',$2) ON CONFLICT DO NOTHING",[id,version||null]);
  await c.query('UPDATE outbox SET processed_at=now() WHERE id=$1',[id]);
  await options.afterEffect?.('before-commit');
 });
}
export {pool};
