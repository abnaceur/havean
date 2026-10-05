import '../support/env';
import {it,expect,afterAll} from 'vitest';
import {createRequire} from 'node:module';
import {pool,transaction,event,type Actor} from '../../packages/database/src/index';
import {expireScheduledListing} from '../../apps/worker/src/expiration';
import {workerActor,createProcessor,searchTask} from '../../apps/worker/src/processor';
const require=createRequire(new URL('../../apps/worker/package.json',import.meta.url)),{Queue,Worker}=require('bullmq');
const url=new URL(process.env.REDIS_URL!),connection={host:url.hostname,port:Number(url.port)||6379,maxRetriesPerRequest:null};
const consumer:Actor={id:'00000000-0000-4000-8000-000000000001',orgId:null,roles:['consumer']};
const createdFixtures:string[]=[];
afterAll(async()=>{try{for(const id of createdFixtures){const eventId=await transaction(workerActor,async c=>{await c.query("UPDATE listings SET status='paused',version=version+1 WHERE id=$1 AND status='published'",[id]);return(await c.query("INSERT INTO outbox(aggregate_id,kind,payload,dispatched_at) VALUES($1,'listing.test_fixture_removed','{}',now()) RETURNING id",[id])).rows[0].id;});await createProcessor()({data:{id:eventId}});}}finally{await pool.end();}});
async function fixture(deadline:Date){const id=await transaction(workerActor,async c=>(await c.query(`INSERT INTO listings(unit_id,organization_id,owner_id,agent_id,slug,title,description,transaction,segment,currency,price,photos,status,published_at,expires_at) SELECT unit_id,organization_id,owner_id,agent_id,$1,title,description,transaction,segment,currency,price,photos,'published',now(),$2 FROM listings WHERE id='10000000-0000-4000-8000-000000002000' RETURNING id`,['expiration-'+crypto.randomUUID(),deadline])).rows[0].id as string);createdFixtures.push(id);return id;}
async function counts(id:string){return transaction(workerActor,async c=>(await c.query("SELECT (SELECT count(*)::int FROM listing_status_history WHERE listing_id=$1 AND next_status='expired') transitions,(SELECT count(*)::int FROM outbox WHERE aggregate_id=$1 AND kind='listing.expired') events,(SELECT count(*)::int FROM audit_events WHERE resource_id=$1 AND action='listing.expired') audits",[id])).rows[0]);}
it('I08 real queue expiration and late duplicate jobs create one atomic transition and remove public destinations/search',async()=>{
 const deadline=new Date(Date.now()+3600000),id=await fixture(deadline),clock=new Date(deadline.getTime()+1000);
 const doc=await transaction(workerActor,async c=>(await c.query('SELECT * FROM public_listings WHERE id=$1',[id])).rows[0]);await searchTask('/indexes/listings/documents','POST',[doc]);
 const name='expiration-proof-'+crypto.randomUUID(),queue=new Queue(name,{connection}),worker=new Worker(name,job=>expireScheduledListing(job.data.id,job.data.deadline,clock),{connection});
 try{
  await queue.add('expire',{id,deadline:deadline.toISOString()},{jobId:crypto.randomUUID()});await expect.poll(()=>counts(id)).toEqual({transitions:1,events:1,audits:1});
  await queue.add('duplicate',{id,deadline:deadline.toISOString()},{jobId:crypto.randomUUID()});await expect.poll(()=>queue.getCompletedCount()).toBe(2);expect(await counts(id)).toEqual({transitions:1,events:1,audits:1});
  expect((await transaction(consumer,c=>c.query('SELECT id FROM public_listings WHERE id=$1',[id]))).rowCount).toBe(0);expect((await transaction(consumer,c=>c.query('SELECT * FROM published_listing_destination($1)',[id]))).rowCount).toBe(0);
  const eventId=await transaction(workerActor,async c=>(await c.query("SELECT id FROM outbox WHERE aggregate_id=$1 AND kind='listing.expired'",[id])).rows[0].id);await createProcessor()({data:{id:eventId}});
  expect((await fetch(process.env.SEARCH_URL+'/indexes/listings/documents/'+id,{headers:{Authorization:'Bearer '+process.env.SEARCH_KEY}})).status).toBe(404);
 }finally{await worker.close();await queue.close();}
});
it('I08 future schedules, rescheduled deadlines and paused properties ignore stale expiration work',async()=>{
 const original=new Date(Date.now()+3600000),later=new Date(original.getTime()+3600000),id=await fixture(original);
 expect(await expireScheduledListing(id,original.toISOString(),new Date(original.getTime()-1))).toBeNull();
 await transaction(workerActor,c=>c.query('UPDATE listings SET expires_at=$2,version=version+1 WHERE id=$1',[id,later]));expect(await expireScheduledListing(id,original.toISOString(),new Date(later.getTime()+1))).toBeNull();
 await transaction(workerActor,c=>c.query("UPDATE listings SET status='paused',version=version+1 WHERE id=$1",[id]));expect(await expireScheduledListing(id,later.toISOString(),new Date(later.getTime()+1))).toBeNull();expect(await counts(id)).toEqual({transitions:0,events:0,audits:0});
});
it('I08 due schedules are unavailable immediately, even before the worker finishes the state transition',async()=>{
 const marker=new Error('rollback fixed due fixture');try{await transaction(workerActor,async c=>{const id=(await c.query(`INSERT INTO listings(unit_id,organization_id,agent_id,slug,title,description,transaction,segment,currency,price,status,expires_at) SELECT unit_id,organization_id,agent_id,$1,title,description,transaction,segment,currency,price,'published','2020-01-01' FROM listings WHERE id='10000000-0000-4000-8000-000000002000' RETURNING id`,['due-'+crypto.randomUUID()])).rows[0].id;expect((await c.query('SELECT id FROM public_listings WHERE id=$1',[id])).rowCount).toBe(0);expect((await c.query('SELECT * FROM published_listing_destination($1)',[id])).rowCount).toBe(0);throw marker;});}catch(error){if(error!==marker)throw error;}
});
it('I08 a consumer cannot invoke the privileged expiration transition',async()=>{
 const deadline=new Date(Date.now()+3600000),id=await fixture(deadline);await expect(transaction(consumer,c=>c.query('SELECT expire_scheduled_listing($1,$2,$3)',[id,deadline,new Date(deadline.getTime()+1)]))).rejects.toMatchObject({code:'42501'});
});
it('I08 a failed downstream event rolls back the expiration and its history together',async()=>{
 const deadline=new Date(Date.now()+3600000),id=await fixture(deadline),marker=new Error('simulated event failure');await expect(transaction(workerActor,async c=>{const r=(await c.query('SELECT expire_scheduled_listing($1,$2,$3) AS result',[id,deadline,new Date(deadline.getTime()+1)])).rows[0].result;expect(r.status).toBe('expired');await event(c,workerActor,id,'listing.expired');throw marker;})).rejects.toBe(marker);expect(await counts(id)).toEqual({transitions:0,events:0,audits:0});expect((await transaction(consumer,c=>c.query('SELECT id FROM public_listings WHERE id=$1',[id]))).rowCount).toBe(1);
});
