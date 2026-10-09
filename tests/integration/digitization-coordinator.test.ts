import '../support/env';
import {afterAll,expect,it} from 'vitest';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {createIntake} from '../../apps/api/src/inventory/digitization/intakes';
import {appendInputRevision} from '../../apps/api/src/inventory/digitization/inputs';
import {verifySmallDigitizationSource} from '../../apps/api/src/inventory/digitization/source-validation';
import {captureStorage} from '../../apps/api/src/inventory/digitization/multipart';
import {cpuSourceFingerprint} from '../../apps/api/src/inventory/digitization/execution-scope';
import {createRunGraph,dispatchRunGraph} from '../../apps/api/src/inventory/digitization/workflow';
import {createDigitizationProcessor,dispatchDigitizationEvents,engineCommands} from '../../apps/worker/src/digitization/coordinator';
import {createProcessor} from '../../apps/worker/src/processor';
import {CpuRunnerClient} from '../../apps/api/src/inventory/digitization/runner-client';
import {readArtifactPreview} from '../../apps/api/src/inventory/digitization/artifact-preview';
const origin=process.env.DIGITIZATION_RUNNER_TEST_ORIGIN;
const requireApi=createRequire(new URL('../../apps/api/package.json',import.meta.url)),sharp=requireApi('sharp'),{CreateBucketCommand,PutObjectCommand,DeleteObjectCommand}=requireApi('@aws-sdk/client-s3');
const requireWorker=createRequire(new URL('../../apps/worker/package.json',import.meta.url)),{Queue,Worker}=requireWorker('bullmq');
const actor:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']};
afterAll(()=>pool.end());

it.skipIf(!origin)('HE-R06/C02 dedicated real queue recovers both enqueue crash boundaries; duplicate events reuse one actual CPU execution and private result',async()=>{
 const testKey='3'.repeat(64),apiOrigin='http://127.0.0.1:9940',directory=await mkdtemp(join(tmpdir(),'haven-engine-coordinator-'));
 const signingFile=join(directory,'synthetic-runner-key');await writeFile(signingFile,'test-only-private-key-not-a-production-credential-0000',{mode:0o600});
 const child=spawn(process.execPath,['--import','tsx','apps/api/src/main.ts'],{env:{...process.env,TSX_TSCONFIG_PATH:'apps/api/tsconfig.json',API_PORT:'9940',DIGITIZATION_COORDINATOR_KEY:testKey,DIGITIZATION_CPU_RUNNER_ORIGIN:origin!,DIGITIZATION_CPU_SIGNING_KEY_FILE:signingFile},stdio:['ignore','ignore','ignore']});
 const redis=new URL(process.env.REDIS_URL!),connection={host:redis.hostname,port:Number(redis.port)||6379,maxRetriesPerRequest:null},queueName='digitization-proof-'+crypto.randomUUID(),queue=new Queue(queueName,{connection});
 const storage=captureStorage(),key=crypto.randomUUID(),objectKeys:string[]=[];let worker:any,crashWorker:ReturnType<typeof spawn>|undefined;
 try{
  const deadline=Date.now()+15000;
  for(;;){if(child.exitCode!==null)throw Error('COORDINATOR_TEST_API_START_FAILED');try{if((await fetch(apiOrigin+'/api/v1/health/live',{signal:AbortSignal.timeout(500)})).ok)break;}catch{/* Readiness is retried within the deadline. */}if(Date.now()>deadline)throw Error('COORDINATOR_TEST_API_NOT_READY');await new Promise(resolve=>setTimeout(resolve,100));}
  const bytes=await sharp({create:{width:3000,height:3000,channels:3,background:'#185b48'}}).png().toBuffer(),workspace=await transaction(actor,c=>createIntake(c,actor));
  const asset=await transaction(actor,async c=>(await c.query("INSERT INTO media_assets(owner_id,object_key,mime,size,rights,visibility,purpose,status,scan_at) VALUES($1,$2,'image/png',$3,'Synthetic coordinator fixture','private','floor_plan','approved',now()) RETURNING id,version",[actor.id,key,bytes.length])).rows[0]);
  try{await storage.send(new CreateBucketCommand({Bucket:'haven-private'}));}catch(e:any){if(!['BucketAlreadyOwnedByYou','BucketAlreadyExists'].includes(e.name))throw e;}
  await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key,Body:bytes}));
  const source=await verifySmallDigitizationSource(actor,workspace.id,asset.id,asset.version,1,'plan');
  await transaction(actor,c=>appendInputRevision(c,actor,workspace.id,1,[source]));
  const stageId=crypto.randomUUID(),runId=crypto.randomUUID(),fingerprint=cpuSourceFingerprint(workspace.id,actor.orgId!,1,'upright-image-v1',{...source,bytes:String(source.bytes)});
  await transaction(actor,c=>createRunGraph(c,actor,workspace.id,2,{schemaVersion:1,id:runId,organizationId:actor.orgId!,creatorId:actor.id,target:{type:'intake',id:workspace.id},inputRevision:1,state:'draft',version:1,stages:[{id:stageId,type:'document_rasterize',state:'pending',dependencies:[],profileId:'upright-image-v1',inputFingerprint:fingerprint,inputRevision:1,attempt:0,fencingToken:null,executionId:null,progress:null}],deadline:new Date(Date.now()+120000).toISOString(),budget:{maxSeconds:30,maxScratchBytes:'67108864'}},['plan']));
  await transaction(actor,c=>dispatchRunGraph(c,actor,workspace.id,runId,1));
  const eventId=(await pool.query("SELECT id FROM outbox WHERE aggregate_id=$1 AND kind='digitization.run_queued'",[workspace.id])).rows[0].id;
  await expect(createProcessor()({data:{id:eventId}})).rejects.toThrow('OUTBOX_CONSUMER_MISMATCH');
  await expect(dispatchDigitizationEvents(pool,queue,{eventIds:[eventId],beforeEnqueue:async()=>{throw Error('CRASH_BEFORE_ENQUEUE');}})).rejects.toThrow('CRASH_BEFORE_ENQUEUE');
  expect(await queue.getJob(eventId)).toBeUndefined();
  await expect(dispatchDigitizationEvents(pool,queue,{eventIds:[eventId],afterEnqueue:async()=>{throw Error('CRASH_AFTER_ENQUEUE');}})).rejects.toThrow('CRASH_AFTER_ENQUEUE');
  expect((await pool.query('SELECT processed_at,dispatched_at FROM outbox WHERE id=$1',[eventId])).rows[0]).toEqual({processed_at:null,dispatched_at:null});
  await dispatchDigitizationEvents(pool,queue,{eventIds:[eventId]});
  expect(await queue.getJobCounts('waiting')).toMatchObject({waiting:1});
  const command=engineCommands(apiOrigin,testKey);
  await expect(engineCommands(apiOrigin,'4'.repeat(64))('/api/v1/internal/digitization/outbox/consume',{eventId})).rejects.toMatchObject({status:401});
  // Two simultaneous service deliveries serialize on the outbox row and return
  // the same committed lease; neither launches a second runner execution.
  const receipts=await Promise.all([command('/api/v1/internal/digitization/outbox/consume',{eventId}),command('/api/v1/internal/digitization/outbox/consume',{eventId})]);
  expect(receipts[0]).toEqual(receipts[1]);
  // PostgreSQL receipts recover a lost Redis handoff. A real expired lease is
  // reconciled once under concurrent deliveries, with a new durable fence.
  await (await queue.getJob(eventId))!.remove();
  await pool.query("UPDATE outbox SET dispatched_at=now()-interval '61 seconds' WHERE id=$1",[eventId]);
  await dispatchDigitizationEvents(pool,queue,{eventIds:[eventId]});
  expect(await queue.getWaitingCount()).toBe(1);
  await transaction(actor,c=>c.query("UPDATE processing_stages SET lease_until=statement_timestamp()+interval '20 milliseconds',version=version+1 WHERE id=$1",[stageId]));
  await new Promise(resolve=>setTimeout(resolve,40));
  const recovered=await Promise.all([command('/api/v1/internal/digitization/outbox/consume',{eventId}),command('/api/v1/internal/digitization/outbox/consume',{eventId})]);
  expect(recovered[0]).toEqual(recovered[1]);
  expect((recovered[0] as any).executions[0].fencingToken).toBe('2');
  const {stageId:oldStage,...oldScope}=(receipts[0] as any).executions[0];
  await expect(command('/api/v1/internal/digitization/stages/'+oldStage+'/start',oldScope)).rejects.toMatchObject({status:409});
  const started=new Promise<void>((resolve,reject)=>{
   crashWorker=spawn(process.execPath,['--import','tsx','tests/support/digitization-coordinator-process.ts'],{env:{...process.env,COORDINATOR_TEST_QUEUE:queueName,COORDINATOR_TEST_API:apiOrigin,COORDINATOR_TEST_KEY:testKey},stdio:['ignore','ignore','ignore','ipc']});
   crashWorker.once('message',()=>resolve());crashWorker.once('exit',()=>reject(Error('COORDINATOR_PROCESS_EARLY_EXIT')));
  });
  await Promise.race([started,new Promise<void>((_resolve,reject)=>setTimeout(()=>reject(Error('COORDINATOR_START_TIMEOUT')),15000))]);
  // The killed process has submitted the real CPU execution but has not collected
  // it. A fresh BullMQ worker recovers the stalled job and reattaches its receipt.
  const stopped=new Promise<void>(resolve=>crashWorker!.once('exit',()=>resolve()));crashWorker!.kill('SIGKILL');await stopped;
  expect(await queue.getActiveCount()).toBe(1);
  worker=new Worker(queueName,createDigitizationProcessor(apiOrigin,testKey),{connection,concurrency:2,lockDuration:2000,stalledInterval:1000});
  worker.on('failed',(_job:any,error:Error)=>console.log(JSON.stringify({event:'test.coordinator.failed',code:error.message})));
  await expect.poll(async()=>transaction(actor,async c=>(await c.query('SELECT state FROM processing_stages WHERE id=$1',[stageId])).rows[0].state),{timeout:20000}).toBe('succeeded');
  await queue.add('engine-event',{id:eventId},{jobId:crypto.randomUUID(),attempts:2});
  await expect.poll(async()=>queue.getCompletedCount(),{timeout:10000}).toBe(2);
  await transaction(actor,async c=>{
   expect((await c.query('SELECT count(*)::int n FROM stage_attempts WHERE stage_id=$1',[stageId])).rows[0].n).toBe(2);
   expect((await c.query("SELECT kind,count(*)::int n FROM digitization_events WHERE run_id=$1 AND kind IN('digitization.stage_leased','digitization.stage_started') GROUP BY kind ORDER BY kind",[runId])).rows).toEqual([{kind:'digitization.stage_leased',n:2},{kind:'digitization.stage_started',n:1}]);
   expect((await c.query("SELECT consumer FROM outbox_effects WHERE event_id=$1",[eventId])).rows).toEqual([{consumer:'digitization'}]);
   const artifacts=(await c.query('SELECT id,object_key,status,privacy_status FROM artifacts WHERE stage_id=$1',[stageId])).rows;
   expect(artifacts).toHaveLength(1);expect(artifacts[0]).toMatchObject({status:'private',privacy_status:'pending'});objectKeys.push(artifacts[0].object_key);
  });
  const preview=(await transaction(actor,async c=>(await c.query('SELECT id,object_key FROM artifacts WHERE stage_id=$1',[stageId])).rows[0]));
  const shown=await readArtifactPreview(actor,workspace.id,preview.id);expect((await sharp(shown).metadata()).width).toBe(3000);
  await expect(readArtifactPreview({...actor,id:'00000000-0000-4000-8000-000000000011',orgId:'10000000-0000-4000-8000-000000000005'},workspace.id,preview.id)).rejects.toMatchObject({status:404});
  await expect(readArtifactPreview(actor,crypto.randomUUID(),preview.id)).rejects.toMatchObject({status:404});
  await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:preview.object_key,Body:Buffer.alloc(shown.length)}));
  await expect(readArtifactPreview(actor,workspace.id,preview.id)).rejects.toMatchObject({status:422});
  await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:preview.object_key,Body:shown,ContentType:'image/png'}));
  // A separate private intake has no reusable lineage. This verifies actual
  // decoder cancellation without treating a successful cache hit as a process.
  const cancelWorkspace=await transaction(actor,c=>createIntake(c,actor));
  const cancelSource=await verifySmallDigitizationSource(actor,cancelWorkspace.id,asset.id,asset.version,1,'plan');
  await transaction(actor,c=>appendInputRevision(c,actor,cancelWorkspace.id,1,[cancelSource]));
  const cancelFingerprint=cpuSourceFingerprint(cancelWorkspace.id,actor.orgId!,1,'upright-image-v1',{...cancelSource,bytes:String(cancelSource.bytes)});
  const cancelRun=crypto.randomUUID(),cancelStage=crypto.randomUUID();
  await transaction(actor,c=>createRunGraph(c,actor,cancelWorkspace.id,2,{schemaVersion:1,id:cancelRun,organizationId:actor.orgId!,creatorId:actor.id,target:{type:'intake',id:cancelWorkspace.id},inputRevision:1,state:'draft',version:1,stages:[{id:cancelStage,type:'document_rasterize',state:'pending',dependencies:[],profileId:'upright-image-v1',inputFingerprint:cancelFingerprint,inputRevision:1,attempt:0,fencingToken:null,executionId:null,progress:null}],deadline:new Date(Date.now()+120000).toISOString(),budget:{maxSeconds:30,maxScratchBytes:'67108864'}},['plan']));
  await transaction(actor,c=>dispatchRunGraph(c,actor,cancelWorkspace.id,cancelRun,1));
  const queuedCancel=(await pool.query("SELECT id FROM outbox WHERE aggregate_id=$1 AND payload->>'runId'=$2 AND kind='digitization.run_queued'",[cancelWorkspace.id,cancelRun])).rows[0].id;
  const cancelHandoff=(await command('/api/v1/internal/digitization/outbox/consume',{eventId:queuedCancel}) as any).executions[0];
  const {stageId:cancelStageId,...cancelScope}=cancelHandoff,cancelPath='/api/v1/internal/digitization/stages/'+cancelStageId;
  const cancelRequest=await command(cancelPath+'/prepare',cancelScope) as any;
  await command(cancelPath+'/start',cancelScope);
  const runner=new CpuRunnerClient(origin!,Buffer.from('test-only-private-key-not-a-production-credential-0000'));
  await expect.poll(async()=>(await runner.read(cancelRequest)).processStopped,{timeout:10000,interval:20}).toBe(false);
  await command('/api/v1/internal/digitization/runs/'+cancelRun+'/cancel',{engineId:cancelWorkspace.id,actorId:actor.id,organizationId:actor.orgId,expectedVersion:3});
  const foreign:Actor={id:'00000000-0000-4000-8000-000000000011',orgId:'10000000-0000-4000-8000-000000000005',roles:['agent']};
  expect(await transaction(foreign,async c=>(await c.query('SELECT digitization_cancellation_metadata($1,$2) metadata',[cancelWorkspace.id,cancelRun])).rows[0].metadata)).toBeNull();
  await expect(transaction(foreign,c=>c.query('SELECT digitization_close_cancellation($1,$2,4)',[cancelWorkspace.id,cancelRun]))).rejects.toMatchObject({code:'42501'});
  const cancellationEvent=(await pool.query("SELECT id FROM outbox WHERE aggregate_id=$1 AND payload->>'runId'=$2 AND kind='digitization.cancel_requested'",[cancelWorkspace.id,cancelRun])).rows[0].id;
  await dispatchDigitizationEvents(pool,queue,{eventIds:[cancellationEvent]});
  await expect.poll(async()=>transaction(actor,async c=>(await c.query('SELECT state FROM processing_runs WHERE id=$1',[cancelRun])).rows[0].state),{timeout:15000}).toBe('cancelled');
  expect(await runner.read(cancelRequest)).toMatchObject({state:'cancelled',processStopped:true,result:null});
  await expect(command(cancelPath+'/collect-renders',cancelScope)).rejects.toMatchObject({status:409});
  expect(await transaction(actor,async c=>(await c.query('SELECT count(*)::int n FROM artifacts WHERE stage_id=$1',[cancelStage])).rows[0].n)).toBe(0);
  const stoppedReceipt=await command('/api/v1/internal/digitization/runs/'+cancelRun+'/complete-cancel',{engineId:cancelWorkspace.id,actorId:actor.id,organizationId:actor.orgId});
  expect(stoppedReceipt).toMatchObject({state:'cancelled'});
  const unknown=crypto.randomUUID();await pool.query("INSERT INTO outbox(id,aggregate_id,kind,payload) VALUES($1,$2,'digitization.future_unknown','{}')",[unknown,workspace.id]);
  await expect(command('/api/v1/internal/digitization/outbox/consume',{eventId:unknown})).rejects.toMatchObject({status:422});
  expect((await pool.query('SELECT processed_at FROM outbox WHERE id=$1',[unknown])).rows[0].processed_at).toBeNull();
  await queue.add('invalid-engine-event',{id:unknown},{jobId:unknown,attempts:5,backoff:{type:'exponential',delay:10}});
  await expect.poll(async()=>queue.getFailedCount(),{timeout:10000}).toBe(1);
  expect((await queue.getJob(unknown))!.attemptsMade).toBe(1);
 }finally{
  if(crashWorker&&crashWorker.exitCode===null&&crashWorker.signalCode===null)crashWorker.kill('SIGKILL');
  await worker?.close();await queue.obliterate({force:true});await queue.close();
  if(child.exitCode===null){const stopped=new Promise<void>(resolve=>child.once('exit',()=>resolve()));child.kill('SIGTERM');await Promise.race([stopped,new Promise<void>(resolve=>setTimeout(resolve,2000))]);if(child.exitCode===null){child.kill('SIGKILL');await stopped;}}
  for(const objectKey of ['quarantine/'+key,...objectKeys])await storage.send(new DeleteObjectCommand({Bucket:'haven-private',Key:objectKey}));storage.destroy();await rm(directory,{recursive:true,force:true});
 }
},60000);

it.skipIf(!origin)('HE-C06 real HTTP outage and BullMQ delivery obey five retries without resetting the failed job',async()=>{
 let calls=0;
 const server=createServer((_req,res)=>{calls++;res.writeHead(503,{'Content-Type':'application/json'}).end(JSON.stringify({error:{code:'DIGITIZATION_SERVICE_UNAVAILABLE'}}));});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();if(!address||typeof address==='string')throw Error('OUTAGE_SERVER_NOT_READY');
 const redis=new URL(process.env.REDIS_URL!),connection={host:redis.hostname,port:Number(redis.port)||6379,maxRetriesPerRequest:null},name='engine-outage-'+crypto.randomUUID(),queue=new Queue(name,{connection});
 const worker=new Worker(name,createDigitizationProcessor('http://127.0.0.1:'+address.port,'3'.repeat(64)),{connection});
 const id=crypto.randomUUID();
 try{
  await queue.add('engine-event',{id},{jobId:id,attempts:5,backoff:{type:'exponential',delay:10}});
  await expect.poll(async()=>queue.getFailedCount(),{timeout:10000}).toBe(1);
  expect(calls).toBe(5);expect((await queue.getJob(id))!.attemptsMade).toBe(5);
  const event=await transaction(actor,async c=>{
   const engine=await createIntake(c,actor);
   return (await c.query("INSERT INTO outbox(id,aggregate_id,kind,payload) VALUES($1,$2,'digitization.intake_created','{}') RETURNING id",[id,engine.id])).rows[0].id;
  });
  await dispatchDigitizationEvents(pool,queue,{eventIds:[event]});
  expect((await queue.getJob(id))!.attemptsMade).toBe(5);expect(await queue.getWaitingCount()).toBe(0);
  expect(calls).toBe(5);
 }finally{
  await worker.close();await queue.obliterate({force:true});await queue.close();
  await new Promise<void>(resolve=>server.close(()=>resolve()));
 }
},20000);
