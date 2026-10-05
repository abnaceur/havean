import {createServer} from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {Queue,Worker} from 'bullmq';
import {config} from '@haven/config';
import {pool,createProcessor,initializeSearch} from './processor.js';
const env=config(),url=new URL(env.REDIS_URL);
export const connection={host:url.hostname,port:Number(url.port)||6379,maxRetriesPerRequest:null};
const queue=new Queue('outbox',{connection});
const metricsServer=createServer(async(req,res)=>{const expected=Buffer.from('Bearer '+env.SESSION_KEY),provided=Buffer.from(req.headers.authorization||'');if(req.url!=='/metrics'||provided.length!==expected.length||!timingSafeEqual(provided,expected)){res.writeHead(404).end();return;}try{const counts=await queue.getJobCounts('waiting','active','delayed','failed','completed');res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify(counts));}catch{res.writeHead(503).end();}});metricsServer.listen(9001,'0.0.0.0');
await initializeSearch();
const worker=new Worker('outbox',createProcessor(),{connection,concurrency:4});
worker.on('failed',(job)=>console.error(JSON.stringify({event:'job.failed',jobId:job?.id,attempt:job?.attemptsMade})));
let running=false;
async function dispatch(){
 if(running)return;running=true;
 try{
  const rows=(await pool.query("SELECT id FROM outbox WHERE processed_at IS NULL AND (dispatched_at IS NULL OR dispatched_at<now()-interval '60 seconds') ORDER BY created_at,id LIMIT 100")).rows;
  for(const row of rows){
   const prior=await queue.getJob(row.id);if(prior&&(await prior.getState())==='failed')await prior.retry();
   await queue.add('event',{id:row.id},{jobId:row.id,attempts:5,backoff:{type:'exponential',delay:1000},removeOnComplete:{age:86400}});
   await pool.query('UPDATE outbox SET dispatched_at=now(),attempts=attempts+1 WHERE id=$1',[row.id]);
  }
 }catch{console.error(JSON.stringify({event:'dispatcher.unavailable'}));}finally{running=false;}
}
await dispatch();const timer=setInterval(dispatch,2000);
async function shutdown(){metricsServer.close();clearInterval(timer);await worker.close();await queue.close();await pool.end();process.exit(0);}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);console.log('Outbox worker running');
