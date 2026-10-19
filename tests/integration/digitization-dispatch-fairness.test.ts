import '../support/env';
import {afterAll,expect,it} from 'vitest';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {pool,transaction,event,type Actor} from '../../packages/database/src/index';
import {createIntake} from '../../apps/api/src/inventory/digitization/intakes';
import {engineCommands,DigitizationCommandError,createDigitizationProcessor,dispatchDigitizationEvents} from '../../apps/worker/src/digitization/coordinator';
const {Queue,Worker}=createRequire(new URL('../../apps/worker/package.json',import.meta.url))('bullmq');
const actor:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']};
afterAll(()=>pool.end());
it('failed historical deliveries cannot starve a later valid notification or acquire fresh retries',async()=>{
 if(process.env.HAVEN_CONTAINER_TESTS!=='true')throw Error('Isolated Compose required');
 const key='6'.repeat(64),origin='http://127.0.0.1:9946',redis=new URL(process.env.REDIS_URL!),connection={host:redis.hostname,port:Number(redis.port)||6379,maxRetriesPerRequest:null},name='dispatch-fairness-'+crypto.randomUUID();
 const api=spawn(process.execPath,['--import','tsx','apps/api/src/main.ts'],{env:{...process.env,TSX_TSCONFIG_PATH:'apps/api/tsconfig.json',API_PORT:'9946',DIGITIZATION_COORDINATOR_KEY:key},stdio:['ignore','pipe','pipe']}),queue=new Queue(name,{connection});
 let ratePauses=0;const worker=new Worker(name,createDigitizationProcessor(origin,key,{onRateLimit:async()=>{ratePauses++;await worker.rateLimit(61000);}}),{connection,concurrency:8,limiter:{max:100,duration:61000}});
 worker.on('failed',(_job:unknown,error:Error)=>{if(error instanceof DigitizationCommandError)console.error(JSON.stringify({event:'fairness.command_failure',code:error.code,status:error.status}));});
 api.stdout?.on('data',chunk=>{for(const line of String(chunk).split('\n'))try{const entry=JSON.parse(line);if(entry.event==='request.error')console.error(JSON.stringify({event:'fairness.api_failure',code:entry.code}));}catch{/* Ignore non-diagnostic startup output. */}});api.stderr?.resume();
 try{
  await expect.poll(async()=>{try{return (await fetch(origin+'/api/v1/health/live',{signal:AbortSignal.timeout(500)})).ok;}catch{return false;}},{timeout:20000}).toBe(true);
  await expect(engineCommands(origin,key)('/api/v1/internal/digitization/outbox/consume',{eventId:crypto.randomUUID()})).rejects.toMatchObject({status:404});
  const workspace=await transaction(actor,c=>createIntake(c,actor));
  await transaction(actor,async c=>{for(let index=0;index<100;index++)await event(c,actor,workspace.id,'digitization.unknown_future_version',{});});
  const ids=(await pool.query("SELECT id FROM outbox WHERE aggregate_id=$1 AND kind='digitization.unknown_future_version' ORDER BY created_at,id",[workspace.id])).rows.map(row=>row.id);
  await dispatchDigitizationEvents(pool,queue,{eventIds:ids});
  await expect.poll(async()=>(await queue.getJobCounts('failed')).failed,{timeout:80000}).toBe(100);expect(ratePauses).toBeGreaterThan(0);
  await pool.query("UPDATE outbox SET dispatched_at=now()-interval '61 seconds' WHERE id=ANY($1::uuid[])",[ids]);
  await worker.pause();
  await transaction(actor,c=>event(c,actor,workspace.id,'digitization.fact_decided',{}));
  const legacy=(await pool.query("SELECT id FROM outbox WHERE aggregate_id=$1 AND kind='digitization.fact_decided'",[workspace.id])).rows[0].id;
  await pool.query("UPDATE outbox SET created_at=now()-interval '10 minutes' WHERE id=$1",[legacy]);
  await transaction(actor,c=>event(c,actor,workspace.id,'digitization.registration_reviewed',{}));
  const fresh=(await pool.query("SELECT id FROM outbox WHERE aggregate_id=$1 AND kind='digitization.registration_reviewed'",[workspace.id])).rows[0].id;
  // Changing the filter starts at the failed first page, as a fresh dispatcher does.
  await dispatchDigitizationEvents(pool,queue,{eventIds:[...ids,legacy,fresh]});
  expect((await queue.getJob(legacy))?.opts.priority).toBe(10);expect((await queue.getJob(fresh))?.opts.priority).toBe(1);await worker.resume();
  await expect.poll(async()=>await (await queue.getJob(fresh))?.getState(),{timeout:75000}).toBe('completed');
  const failed=await queue.getFailed(0,100);expect(failed).toHaveLength(100);expect(failed.every((job:{attemptsMade:number;failedReason:string})=>job.attemptsMade===1&&job.failedReason==='ENGINE_EVENT_UNSUPPORTED')).toBe(true);
  expect((await pool.query('SELECT count(*)::int n FROM outbox WHERE id=ANY($1::uuid[]) AND processed_at IS NULL AND attempts=1',[ids])).rows[0].n).toBe(100);
  await transaction(actor,async c=>{expect((await c.query("SELECT count(*)::int n FROM outbox_effects WHERE event_id=$1 AND consumer='digitization'",[fresh])).rows[0].n).toBe(1);});
  await dispatchDigitizationEvents(pool,queue,{eventIds:[...ids,legacy,fresh]});expect((await queue.getJobCounts('failed')).failed).toBe(100);
 }finally{
  await worker.close();try{await queue.obliterate({force:true});}finally{await queue.close();}
  if(api.exitCode===null&&api.signalCode===null)await new Promise<void>(resolve=>{const timer=setTimeout(()=>api.kill('SIGKILL'),2000);api.once('exit',()=>{clearTimeout(timer);resolve();});api.kill('SIGTERM');});
 }
},180000);

it('a fresh event is discovered in the first bounded pass ahead of a thousand undispatched historical events',async()=>{
 if(process.env.HAVEN_CONTAINER_TESTS!=='true')throw Error('Isolated Compose required');
 const redis=new URL(process.env.REDIS_URL!),connection={host:redis.hostname,port:Number(redis.port)||6379,maxRetriesPerRequest:null},queue=new Queue('dispatch-discovery-'+crypto.randomUUID(),{connection});
 const workspace=await transaction(actor,c=>createIntake(c,actor));let ids:string[]=[];
 try{
  ids=(await pool.query("INSERT INTO outbox(aggregate_id,kind,payload,created_at) SELECT $1,'digitization.fact_decided','{}'::jsonb,now()-interval '10 minutes' FROM generate_series(1,1100) RETURNING id",[workspace.id])).rows.map(row=>row.id);
  const fresh=(await pool.query("INSERT INTO outbox(aggregate_id,kind,payload) VALUES($1,'digitization.registration_reviewed','{}'::jsonb) RETURNING id",[workspace.id])).rows[0].id;ids.push(fresh);
  await dispatchDigitizationEvents(pool,queue,{eventIds:ids});
  expect((await queue.getJob(fresh))?.opts.priority).toBe(1);
  expect((await queue.getJobCounts('prioritized')).prioritized).toBe(100);
  const historical=await queue.getJobs(['prioritized'],0,100);expect(historical.filter((job:{id:string})=>job.id!==fresh)).toHaveLength(99);
  expect((await pool.query('SELECT count(*)::int n FROM outbox WHERE id=ANY($1::uuid[]) AND dispatched_at IS NOT NULL AND attempts=1',[ids])).rows[0].n).toBe(100);
  await dispatchDigitizationEvents(pool,queue,{eventIds:ids});
  expect((await queue.getJobCounts('prioritized')).prioritized).toBe(200);
  expect((await queue.getJob(fresh))?.attemptsMade).toBe(0);
 }finally{
  await queue.obliterate({force:true});await queue.close();
  // Only these unconsumed synthetic rows belong to this disposable queue.
  if(ids.length)await pool.query('DELETE FROM outbox WHERE aggregate_id=$1 AND id=ANY($2::uuid[]) AND processed_at IS NULL',[workspace.id,ids]);
 }
},30000);
