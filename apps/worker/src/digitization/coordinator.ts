import {config,digitizationWorkerHeaders} from '@haven/config';
import {digitizationOutboxReceipt,type DigitizationExecutionHandoff} from '@haven/contracts';
import type pg from 'pg';
import {UnrecoverableError,type Queue} from 'bullmq';

export class DigitizationCommandError extends Error{
 constructor(readonly status:number,readonly code:string){super('DIGITIZATION_COMMAND_FAILED');}
}
export function engineCommands(origin:string,key:string){
 const url=new URL(origin);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.hash||url.search||!/^[a-f0-9]{64}$/.test(key))throw Error('DIGITIZATION_COORDINATOR_CONFIGURATION_INVALID');
 return async(path:string,body:unknown)=>{
  const response=await fetch(origin.replace(/\/$/,'')+path,{method:'POST',headers:{Origin:config().PUBLIC_WEB_URL,'Content-Type':'application/json',...digitizationWorkerHeaders('POST',path,body,key)},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  if(!response.body)throw Error('DIGITIZATION_COMMAND_RESPONSE_INVALID');
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>65536)throw Error('DIGITIZATION_COMMAND_RESPONSE_BUDGET');chunks.push(part.value);}}finally{await reader.cancel();reader.releaseLock();}
  const decoded=JSON.parse(Buffer.concat(chunks).toString()) as {data?:unknown;error?:{code?:string}};
  if(!response.ok)throw new DigitizationCommandError(response.status,/^[A-Z_]{1,100}$/.test(decoded.error?.code??'')?decoded.error!.code!:'REQUEST_FAILED');
  return decoded.data;
 };
}
export function createDigitizationProcessor(origin:string,key:string,options:{afterStart?:(handoff:DigitizationExecutionHandoff)=>Promise<void>}={}){
 const command=engineCommands(origin,key);
 return async(job:{data:{id:string}})=>{
  try{
  const receipt=digitizationOutboxReceipt.parse(await command('/api/v1/internal/digitization/outbox/consume',{eventId:job.data.id}));
  if(receipt.cancellation){const {runId,...scope}=receipt.cancellation;await command('/api/v1/internal/digitization/runs/'+runId+'/complete-cancel',scope);}
  for(const handoff of receipt.executions)await execute(handoff);
  }catch(error){
   if(error instanceof DigitizationCommandError&&error.status>=400&&error.status<500&&error.status!==429)throw new UnrecoverableError(error.code);
   throw error;
  }
  async function execute(handoff:DigitizationExecutionHandoff){
   const {stageId,...body}=handoff,path='/api/v1/internal/digitization/stages/'+stageId;
   await command(path+'/start',body);
   await options.afterStart?.(handoff);
   const until=Date.now()+90000;let nextRenewal=Date.now()+30000;
   for(;;){
    try{await command(path+'/collect-renders',body);return;}
    catch(error){if(!(error instanceof DigitizationCommandError)||error.status!==409||error.code!=='RESULT_NOT_READY')throw error;}
    if(Date.now()>=until)throw Error('DIGITIZATION_RESULT_PENDING');
    if(Date.now()>=nextRenewal){const {assetId:_assetId,...scope}=body;await command(path+'/renew',scope);nextRenewal=Date.now()+30000;}
    await new Promise(resolve=>setTimeout(resolve,1000));
   }
  }
 };
}

/** Enqueue first, stamp afterwards. A crash at either boundary is replayable;
 * stable job IDs and API execution receipts own duplication protection.
 */
export async function dispatchDigitizationEvents(db:pg.Pool,queue:Queue,options:{eventIds?:readonly string[];beforeEnqueue?:(id:string)=>Promise<void>;afterEnqueue?:(id:string)=>Promise<void>}={}){
 const rows=(await db.query(`SELECT o.id FROM outbox o WHERE o.kind LIKE 'digitization.%'
 AND (o.processed_at IS NULL OR o.id IN(SELECT event_id FROM digitization_recoverable_events()))
 AND (o.dispatched_at IS NULL OR o.dispatched_at<now()-interval '60 seconds')
 AND ($1::uuid[] IS NULL OR o.id=ANY($1::uuid[])) ORDER BY o.created_at,o.id LIMIT 100`,[options.eventIds??null])).rows;
 for(const row of rows){
  const prior=await queue.getJob(row.id);
  // Failed deliveries require supported reconciliation/operator action; polling
  // must not reset the bounded queue retry counter forever.
  if(prior&&(await prior.getState())==='failed')continue;
  await options.beforeEnqueue?.(row.id);
  await queue.add('engine-event',{id:row.id},{jobId:row.id,attempts:5,backoff:{type:'exponential',delay:1000},removeOnComplete:{age:86400}});
  await options.afterEnqueue?.(row.id);
  await db.query('UPDATE outbox SET dispatched_at=now(),attempts=attempts+1 WHERE id=$1',[row.id]);
 }
}
