import '../support/env';
import {afterAll,expect,it} from 'vitest';
import {spawn,type ChildProcess} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {createIntake} from '../../apps/api/src/inventory/digitization/intakes';
import {appendInputRevision} from '../../apps/api/src/inventory/digitization/inputs';
import {verifySmallDigitizationSource} from '../../apps/api/src/inventory/digitization/source-validation';
import {captureStorage} from '../../apps/api/src/inventory/digitization/multipart';
import {startPrivateSourceProcessing} from '../../apps/api/src/inventory/digitization/processing';
import {prepareCpuExecution} from '../../apps/api/src/inventory/digitization/execution-scope';
import {CpuRunnerClient} from '../../apps/api/src/inventory/digitization/runner-client';
import {readArtifactPreview} from '../../apps/api/src/inventory/digitization/artifact-preview';
import {requestRunCancellation,completeRunCancellation} from '../../apps/api/src/inventory/digitization/cancellation';
import {dispatchDigitizationEvents,engineCommands} from '../../apps/worker/src/digitization/coordinator';
import type {DigitizationExecutionHandoff} from '../../packages/contracts/src/index';
const origin=process.env.DIGITIZATION_RUNNER_TEST_ORIGIN,actor:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']};
const requireApi=createRequire(new URL('../../apps/api/package.json',import.meta.url)),sharp=requireApi('sharp'),{PutObjectCommand,GetObjectCommand,DeleteObjectCommand}=requireApi('@aws-sdk/client-s3'),{Queue}=createRequire(new URL('../../apps/worker/package.json',import.meta.url))('bullmq');
afterAll(()=>pool.end());
function observation(child:ChildProcess,event:string){return new Promise<any>((resolve,reject)=>{const timer=setTimeout(()=>finish(Error('CRASH_REHEARSAL_TIMEOUT_'+event)),20000);const receive=(message:any)=>{if(message.event===event)finish(null,message);else if(['failed','error'].includes(message.event))finish(Error('CRASH_REHEARSAL_WORKER_'+JSON.stringify(message)));};const exited=()=>finish(Error('CRASH_REHEARSAL_EARLY_EXIT'));function finish(error:Error|null,value?:any){clearTimeout(timer);child.off('message',receive);child.off('exit',exited);if(error)reject(error);else resolve(value);}child.on('message',receive);child.once('exit',exited);});}
async function stop(child:ChildProcess|undefined,signal:'SIGTERM'|'SIGKILL'='SIGTERM'){if(!child||child.exitCode!==null||child.signalCode!==null)return;await new Promise<void>(resolve=>{const timer=setTimeout(()=>child.kill('SIGKILL'),2000);child.once('exit',()=>{clearTimeout(timer);resolve();});child.kill(signal);});}
function nativePdf(){
 const text='BT /F1 12 Tf 20 160 Td (Unit number: 00123) Tj 0 -20 Td (Unit area: 123.45 m2) Tj ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`];
 let output='%PDF-1.4\n';const offsets:number[]=[];
 for(const [index,object] of objects.entries()){offsets.push(Buffer.byteLength(output));output+=`${index+1} 0 obj\n${object}\nendobj\n`;}
 const xref=Buffer.byteLength(output);output+=`xref\n0 6\n0000000000 65535 f \n${offsets.map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return Buffer.from(output);
}
it.skipIf(!origin).each(['plan','facts','panorama'] as const)('SIGKILL at enqueue and submitted %s boundaries recovers the same execution through Redis once and privately',async output=>{
 if(process.env.HAVEN_CONTAINER_TESTS!=='true')throw Error('Isolated Compose required');
 const directory=await mkdtemp(join(tmpdir(),'haven-crash-')),signingFile=join(directory,'test-key'),key='4'.repeat(64),apiOrigin='http://127.0.0.1:9942';
 await writeFile(signingFile,'test-only-private-key-not-a-production-credential-0000',{mode:0o600});
 const api=spawn(process.execPath,['--import','tsx','apps/api/src/main.ts'],{env:{...process.env,TSX_TSCONFIG_PATH:'apps/api/tsconfig.json',API_PORT:'9942',DIGITIZATION_COORDINATOR_KEY:key,DIGITIZATION_CPU_RUNNER_ORIGIN:origin!,DIGITIZATION_CPU_SIGNING_KEY_FILE:signingFile},stdio:'ignore'});
 const redis=new URL(process.env.REDIS_URL!),queueName='crash-rehearsal-'+crypto.randomUUID(),queue=new Queue(queueName,{connection:{host:redis.hostname,port:Number(redis.port)||6379,maxRetriesPerRequest:null}}),storage=captureStorage(),sourceKey='quarantine/'+crypto.randomUUID(),outputKeys:string[]=[];
 const client=new CpuRunnerClient(origin!,Buffer.from('test-only-private-key-not-a-production-credential-0000'));let dispatcher:ChildProcess|undefined,first:ChildProcess|undefined,restarted:ChildProcess|undefined,engine:string|undefined,runId:string|undefined;
 const launch=(pause:boolean)=>spawn(process.execPath,['--import','tsx','tests/support/digitization-crash-worker.ts'],{env:{...process.env,DIGITIZATION_CRASH_QUEUE:queueName,DIGITIZATION_CRASH_API:apiOrigin,DIGITIZATION_CRASH_KEY:key,DIGITIZATION_CRASH_PAUSE:String(pause)},stdio:['ignore','ignore','inherit','ipc']});
 try{
  await expect.poll(async()=>{try{return (await fetch(apiOrigin+'/api/v1/health/live',{signal:AbortSignal.timeout(500)})).ok;}catch{return false;}},{timeout:20000}).toBe(true);
  const mime=output==='facts'?'application/pdf':'image/png',purpose=output==='facts'?'document':output==='panorama'?'panorama':'plan',bytes=output==='facts'?nativePdf():await sharp({create:{width:output==='panorama'?2048:32,height:output==='panorama'?1024:24,channels:3,background:'#185b48'}}).png().toBuffer(),workspace=await transaction(actor,c=>createIntake(c,actor));engine=workspace.id;
  const asset=await transaction(actor,async c=>(await c.query("INSERT INTO media_assets(owner_id,object_key,mime,size,rights,visibility,purpose,status,scan_at) VALUES($1,$2,$4,$3,'Authored crash rehearsal input','private',$5,'approved',now()) RETURNING id,version",[actor.id,sourceKey.slice('quarantine/'.length),bytes.length,mime,output==='facts'?'document':output==='panorama'?'panorama':'floor_plan'])).rows[0]);
  await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:sourceKey,Body:bytes}));
  const verified=await verifySmallDigitizationSource(actor,engine!,asset.id,asset.version,1,purpose);await transaction(actor,c=>appendInputRevision(c,actor,engine!,1,[verified]));
  const run=await transaction(actor,c=>startPrivateSourceProcessing(c,actor,engine!,{version:2,inputRevision:1,assetId:asset.id,output,locale:'en'}));runId=run.id;
  const eventId=(await pool.query("SELECT id FROM outbox WHERE aggregate_id=$1 AND kind='digitization.run_queued' AND payload->>'runId'=$2",[engine,runId])).rows[0].id;
  dispatcher=spawn(process.execPath,['--import','tsx','tests/support/digitization-crash-dispatcher.ts'],{env:{...process.env,DIGITIZATION_CRASH_QUEUE:queueName,DIGITIZATION_CRASH_EVENT:eventId},stdio:['ignore','ignore','inherit','ipc']});
  expect((await observation(dispatcher,'enqueued')).eventId).toBe(eventId);await stop(dispatcher,'SIGKILL');expect(dispatcher.signalCode).toBe('SIGKILL');
  expect((await pool.query('SELECT dispatched_at,attempts FROM outbox WHERE id=$1',[eventId])).rows[0]).toEqual({dispatched_at:null,attempts:0});
  expect(await queue.getJobCounts('wait','prioritized','active','completed')).toMatchObject({wait:0,prioritized:1,active:0,completed:0});
  await dispatchDigitizationEvents(pool,queue,{eventIds:[eventId]});
  expect(await queue.getJobCounts('wait','prioritized','active','completed')).toMatchObject({wait:0,prioritized:1,active:0,completed:0});
  expect((await pool.query('SELECT attempts FROM outbox WHERE id=$1',[eventId])).rows[0].attempts).toBe(1);
  first=launch(true);const submitted=observation(first,'submitted');
  const handoff:DigitizationExecutionHandoff=(await submitted).handoff;
  await stop(first,'SIGKILL');expect(first.signalCode).toBe('SIGKILL');
  const {stageId,...scope}=handoff,command=engineCommands(apiOrigin,key),path='/api/v1/internal/digitization/stages/'+stageId;
  const request=await transaction(actor,c=>prepareCpuExecution(c,actor,engine!,stageId,handoff.executionId,handoff.fencingToken,asset.id));
  await expect.poll(async()=>(await client.read(request)).state,{timeout:10000}).toBe('succeeded');
  const snapshot=()=>transaction(actor,async c=>({stage:(await c.query('SELECT state,execution_id,fencing_token,attempt FROM processing_stages WHERE id=$1',[stageId])).rows[0],attempts:(await c.query('SELECT count(*)::int n FROM stage_attempts WHERE stage_id=$1',[stageId])).rows[0].n,artifacts:(await c.query('SELECT id,object_key,status,privacy_status,checksum,format,byte_size::text FROM artifacts WHERE stage_id=$1 ORDER BY id',[stageId])).rows}));
  expect(await snapshot()).toMatchObject({stage:{state:'running',execution_id:handoff.executionId,attempt:1},attempts:1,artifacts:[]});
  restarted=launch(false);await Promise.all([observation(restarted,'completed'),observation(restarted,'stalled')]);
  const recovered=await snapshot();expect(recovered.stage).toMatchObject({state:'succeeded',execution_id:handoff.executionId,fencing_token:handoff.fencingToken,attempt:1});expect(recovered.attempts).toBe(1);expect(recovered.artifacts).toHaveLength(output==='plan'?1:2);
  for(const artifact of recovered.artifacts){outputKeys.push(artifact.object_key);expect(artifact).toMatchObject({status:'private',privacy_status:'pending'});const stored=await storage.send(new GetObjectCommand({Bucket:'haven-private',Key:artifact.object_key}));if(!('Body' in stored)||!stored.Body)throw Error('CRASH_RECOVERED_OBJECT_MISSING');const body=Buffer.from(await stored.Body.transformToByteArray());expect(String(body.length)).toBe(artifact.byte_size);expect(createHash('sha256').update(body).digest('hex')).toBe(artifact.checksum);if(artifact.format==='image/png')expect(await readArtifactPreview(actor,engine!,artifact.id)).toEqual(body);}
  const candidates=()=>transaction(actor,async c=>(await c.query('SELECT id,candidate FROM fact_candidates WHERE digitization_id=$1 ORDER BY id',[engine])).rows);
  const initialCandidates=await candidates();expect(initialCandidates).toHaveLength(output==='facts'?2:0);
  if(output==='facts'){expect(initialCandidates.find(row=>row.candidate.field==='unitArea').candidate.normalizedValue.amount).toBe('123.45');expect(initialCandidates.every(row=>row.candidate.review.status==='pending')).toBe(true);}
  await command('/api/v1/internal/digitization/outbox/consume',{eventId});
  const receipt=await command(path+'/collect-renders',scope);expect(await command(path+'/collect-renders',scope)).toEqual(receipt);
  expect(await snapshot()).toEqual(recovered);expect(await candidates()).toEqual(initialCandidates);expect(await (await queue.getJob(eventId))!.getState()).toBe('completed');
  await expect(command(path+'/prepare',{...scope,actorId:'00000000-0000-4000-8000-000000000011',organizationId:'10000000-0000-4000-8000-000000000005'})).rejects.toMatchObject({status:404});
  await expect(engineCommands(apiOrigin,'5'.repeat(64))('/api/v1/internal/digitization/outbox/consume',{eventId})).rejects.toMatchObject({status:401});
  await transaction(actor,async c=>{expect((await c.query("SELECT count(*)::int n FROM outbox_effects WHERE event_id=$1 AND consumer='digitization'",[eventId])).rows[0].n).toBe(1);expect((await c.query("SELECT count(*)::int n FROM outbox WHERE aggregate_id=$1 AND kind='digitization.stage_completed'",[engine])).rows[0].n).toBe(1);expect((await c.query('SELECT count(*)::int n FROM published_packages WHERE digitization_id=$1',[engine])).rows[0].n).toBe(0);});
 }finally{
  await stop(dispatcher);await stop(first);await stop(restarted);
  try{
   if(engine&&runId){const run=await transaction(actor,async c=>(await c.query('SELECT version,state FROM processing_runs WHERE id=$1',[runId])).rows[0]);if(run&&!['ready','cancelled'].includes(run.state)){await transaction(actor,c=>requestRunCancellation(c,actor,engine!,runId!,run.version));await completeRunCancellation(actor,engine,runId,client);}}
  }finally{
   try{await queue.obliterate({force:true});}finally{await queue.close();await stop(api);}
   try{if(engine)outputKeys.push(...await transaction(actor,async c=>(await c.query('SELECT object_key FROM artifacts WHERE digitization_id=$1',[engine])).rows.map(row=>row.object_key)));for(const objectKey of new Set([sourceKey,...outputKeys]))await storage.send(new DeleteObjectCommand({Bucket:'haven-private',Key:objectKey}));}finally{storage.destroy();await rm(directory,{recursive:true,force:true});}
  }
 }
},60000);
