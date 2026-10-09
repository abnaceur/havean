import {projectAnalytics} from './analytics.js';
import {dueViewingReminders,deliverViewingReminder} from './viewing-reminders.js';
import {dueAlertDigests,deliverAlertDigest} from './alerts.js';
import {createServer} from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {Queue,Worker} from 'bullmq';
import {config} from '@haven/config';
import {expireScheduledListing,dueExpirations} from './expiration.js';
import {pool,createProcessor,initializeSearch} from './processor.js';
import {createDigitizationProcessor,dispatchDigitizationEvents,engineCommands} from './digitization/coordinator.js';
import {digitizationQueueName} from '@haven/contracts';
const env=config(),url=new URL(env.REDIS_URL);
export const connection={host:url.hostname,port:Number(url.port)||6379,maxRetriesPerRequest:null};
const queue=new Queue('outbox',{connection});
const engineKey=process.env.DIGITIZATION_COORDINATOR_KEY;
if(engineKey===env.SESSION_KEY)throw Error('DIGITIZATION_COORDINATOR_KEY_MUST_BE_SEPARATE');
const engineQueue=engineKey?new Queue(digitizationQueueName,{connection}):null;
const engineWorker=engineKey?new Worker(digitizationQueueName,createDigitizationProcessor(env.API_INTERNAL_URL,engineKey),{connection,concurrency:1}):null;
engineWorker?.on('failed',job=>console.error(JSON.stringify({event:'digitization.job_failed',jobId:job?.id,attempt:job?.attemptsMade})));
const metricsServer=createServer(async(req,res)=>{const expected=Buffer.from('Bearer '+env.SESSION_KEY),provided=Buffer.from(req.headers.authorization||'');if(req.url!=='/metrics'||provided.length!==expected.length||!timingSafeEqual(provided,expected)){res.writeHead(404).end();return;}try{const counts=await queue.getJobCounts('waiting','active','delayed','failed','completed');res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify(counts));}catch{res.writeHead(503).end();}});metricsServer.listen(9001,'0.0.0.0');
await initializeSearch();
const project=createProcessor();
const worker=new Worker('outbox',job=>job.name==='viewing-reminder'?deliverViewingReminder(job.data.id):job.name==='alert'?deliverAlertDigest(job.data.id):job.name==='expiration'?expireScheduledListing(job.data.id,job.data.deadline):project(job),{connection,concurrency:4});
worker.on('failed',(job)=>console.error(JSON.stringify({event:'job.failed',jobId:job?.id,attempt:job?.attemptsMade})));
let running=false;
let cleanupPending:Promise<unknown>|null=null;
function dispatchCleanup(){if(!engineKey||cleanupPending)return;cleanupPending=engineCommands(env.API_INTERNAL_URL,engineKey)('/api/v1/internal/digitization/maintenance/cleanup',{}).catch(()=>console.error(JSON.stringify({event:'digitization.cleanup_unavailable'}))).finally(()=>{cleanupPending=null;});}
async function dispatch(){
 if(running)return;running=true;
 try{
  if(engineQueue)try{await dispatchDigitizationEvents(pool,engineQueue);}catch{console.error(JSON.stringify({event:'digitization.dispatch_unavailable'}));}
  try{await projectAnalytics();}catch{console.error(JSON.stringify({event:'analytics_projection.unavailable'}));}
  try{for(const row of await dueAlertDigests()){const jobId='alert-'+row.id+'-'+row.version;const prior=await queue.getJob(jobId);if(prior&&(await prior.getState())==='failed')await prior.retry();await queue.add('alert',{id:row.id},{jobId,attempts:5,backoff:{type:'exponential',delay:1000},removeOnComplete:{age:86400}});}}catch{console.error(JSON.stringify({event:'alert_dispatcher.unavailable'}));}
  try{for(const row of await dueViewingReminders()){const jobId='reminder-'+row.id+'-'+row.version;const prior=await queue.getJob(jobId);if(prior&&(await prior.getState())==='failed')await prior.retry();await queue.add('viewing-reminder',{id:row.id},{jobId,attempts:5,backoff:{type:'exponential',delay:1000},removeOnComplete:{age:86400}});}}catch{console.error(JSON.stringify({event:'reminder_dispatcher.unavailable'}));}
  for(const row of await dueExpirations()){const jobId='expiration-'+row.id+'-'+row.version;const prior=await queue.getJob(jobId);if(prior&&(await prior.getState())==='failed')await prior.retry();await queue.add('expiration',{id:row.id,deadline:row.deadline},{jobId,attempts:5,backoff:{type:'exponential',delay:1000},removeOnComplete:{age:86400}});}
  const rows=(await pool.query("SELECT id FROM outbox WHERE processed_at IS NULL AND kind NOT LIKE 'digitization.%' AND (dispatched_at IS NULL OR dispatched_at<now()-interval '60 seconds') ORDER BY created_at,id LIMIT 100")).rows;
  for(const row of rows){
   const prior=await queue.getJob(row.id);if(prior&&(await prior.getState())==='failed')await prior.retry();
   await queue.add('event',{id:row.id},{jobId:row.id,attempts:5,backoff:{type:'exponential',delay:1000},removeOnComplete:{age:86400}});
   await pool.query('UPDATE outbox SET dispatched_at=now(),attempts=attempts+1 WHERE id=$1',[row.id]);
  }
 }catch{console.error(JSON.stringify({event:'dispatcher.unavailable'}));}finally{running=false;}
}
await dispatch();const timer=setInterval(dispatch,2000);dispatchCleanup();const cleanupTimer=setInterval(dispatchCleanup,60000);
async function shutdown(){metricsServer.close();clearInterval(timer);clearInterval(cleanupTimer);await cleanupPending;await engineWorker?.close();await engineQueue?.close();await worker.close();await queue.close();await pool.end();process.exit(0);}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);console.log('Outbox worker running');
