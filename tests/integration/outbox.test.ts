import '../support/env';
import {describe,it,expect,afterAll} from 'vitest';
import {createRequire} from 'node:module';
import {fork,type ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import {pool,transaction} from '../../packages/database/src/index';
import {createProcessor,workerActor} from '../../apps/worker/src/processor';
const require=createRequire(new URL('../../apps/worker/package.json',import.meta.url)),{Queue,Worker}=require('bullmq');
const redis=new URL(process.env.REDIS_URL!),connection={host:redis.hostname,port:Number(redis.port)||6379,maxRetriesPerRequest:null};
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`,person=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
afterAll(()=>pool.end());
function waitMessage(child:ChildProcess,event:string){return new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Worker did not reach '+event)),20000);child.on('message',(value:any)=>{if(value.event===event){clearTimeout(timeout);resolve();}});child.once('error',reject);});}
async function runQueue(name:string,processor:any,eventId:string){const queue=new Queue(name,{connection}),worker=new Worker(name,processor,{connection,lockDuration:1000,stalledInterval:1000});try{await queue.add('event',{id:eventId},{jobId:crypto.randomUUID(),attempts:3,backoff:{type:'fixed',delay:100}});await expect.poll(async()=>Boolean((await pool.query('SELECT processed_at FROM outbox WHERE id=$1',[eventId])).rows[0]?.processed_at),{timeout:20000}).toBe(true);return queue;}finally{await worker.close();await queue.close();}}
describe('F09 real queue replay and crash recovery',()=>{
 it('crash after SMTP delivery retries without duplicating mail or notifications',async()=>{
  const queueName='crash-'+crypto.randomUUID(),eventId=crypto.randomUUID(),leadId=crypto.randomUUID();
  await transaction(workerActor,async c=>{await c.query("INSERT INTO leads(id,user_id,organization_id,resource_id,resource_type,name,email,phone,message) VALUES($1,$2,$3,$4,'listing','Queue Buyer','queue@example.test','123456789','Synthetic queue retry inquiry')",[leadId,person(1),id(1),id(2000)]);await c.query("INSERT INTO outbox(id,aggregate_id,kind,payload,dispatched_at) VALUES($1,$2,'inquiry.submitted','{}',now())",[eventId,leadId]);});
  const queue=new Queue(queueName,{connection});let child:ChildProcess|undefined;
  try{
   child=fork('tests/support/crash-worker.ts',[],{execArgv:['--import','tsx'],env:{...process.env,TEST_QUEUE:queueName,TEST_CRASH_POINT:'after-mail',MAIL_API_URL:'http://mail:8025',MAIL_HOST:'mail'},stdio:['ignore','ignore','ignore','ipc']});
   await waitMessage(child,'ready');const applied=waitMessage(child,'effect-applied');await queue.add('event',{id:eventId},{jobId:eventId,attempts:3});await applied;
   const exited=once(child,'exit');child.kill('SIGKILL');await exited;
   expect((await pool.query('SELECT processed_at FROM outbox WHERE id=$1',[eventId])).rows[0].processed_at).toBeNull();
   await runQueue(queueName,createProcessor(),eventId);
   const mail=await fetch('http://mail:8025/api/v1/search?query='+encodeURIComponent('message-id:'+eventId+'@haven.local')).then(r=>r.json());expect(mail.messages_count).toBe(1);
   await runQueue(queueName,createProcessor(),eventId);
   const effects=await transaction(workerActor,c=>c.query('SELECT * FROM outbox_effects WHERE event_id=$1',[eventId]));expect(effects.rowCount).toBe(1);
   const notifications=await transaction(workerActor,c=>c.query('SELECT * FROM notifications WHERE source_event_id=$1',[eventId]));expect(notifications.rowCount).toBe(1);
  }finally{child?.kill('SIGKILL');await queue.obliterate({force:true});await queue.close();}
 },30000);
 it('an old publish event cannot resurrect withdrawn inventory',async()=>{
  const listingId=id(2097),queueName='withdrawal-'+crypto.randomUUID(),eventId=crypto.randomUUID();
  const original=(await transaction(workerActor,c=>c.query('SELECT status,version FROM listings WHERE id=$1',[listingId]))).rows[0];
  try{
   await transaction(workerActor,async c=>{await c.query("UPDATE listings SET status='paused',version=version+1 WHERE id=$1",[listingId]);await c.query("INSERT INTO outbox(id,aggregate_id,kind,payload,dispatched_at) VALUES($1,$2,'listing.published','{}',now())",[eventId,listingId]);});
   let failed=false;
   await runQueue(queueName,createProcessor({afterEffect:async point=>{if(point==='after-search'&&!failed){failed=true;throw Error('SIMULATED_CRASH_AFTER_PROJECTION');}}}),eventId);
   expect(failed).toBe(true);
   const document=await fetch(process.env.SEARCH_URL+'/indexes/listings/documents/'+listingId,{headers:{Authorization:'Bearer '+process.env.SEARCH_KEY}});expect(document.status).toBe(404);
   const version=await transaction(workerActor,c=>c.query("SELECT * FROM projection_versions WHERE aggregate_id=$1 AND projection='listings'",[listingId]));expect(version.rows[0].tombstone).toBe(true);expect(version.rows[0].source_version).toBeGreaterThan(original.version);
  }finally{
   await transaction(workerActor,async c=>{await c.query('UPDATE listings SET status=$2,version=version+1 WHERE id=$1',[listingId,original.status]);await c.query("INSERT INTO outbox(aggregate_id,kind,payload) VALUES($1,'listing.restored','{}')",[listingId]);});
   const queue=new Queue(queueName,{connection});await queue.obliterate({force:true});await queue.close();
  }
 });
});
