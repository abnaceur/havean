// Real SQL/S3/API/HTTP integration with explicitly authored runner output.
// This validates orchestration only. It never imports CUDA or runs gsplat.
import './env';
import assert from 'node:assert/strict';
import {createHash,createHmac,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {createRequire} from 'node:module';
import type {FastifyRequest} from 'fastify';
import type {Identity} from '../../apps/api/src/platform/core';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {gsplatTrainingProfile,digitizationTrainingResult} from '../../packages/contracts/src/index';
import {DigitizationFrameController} from '../../apps/api/src/inventory/digitization/frame-controller';
import {trainingContext} from '../../apps/api/src/inventory/digitization/training-input';
import {consumeDigitizationEvent} from '../../apps/api/src/inventory/digitization/outbox';
import {startCpuExecution} from '../../apps/api/src/inventory/digitization/execution-start';
import {collectCpuRenders} from '../../apps/api/src/inventory/digitization/execution-results';
import {executionRequestDigest,CpuRunnerClient} from '../../apps/api/src/inventory/digitization/runner-client';
import {requestRunCancellation,completeRunCancellation} from '../../apps/api/src/inventory/digitization/cancellation';
import {privateSceneTiers,readPrivateSceneTier} from '../../apps/api/src/inventory/digitization/scene-preview';
import {readReconstructionStatus} from '../../apps/api/src/inventory/digitization/reconstruction-status';
assert.equal(process.env.HAVEN_ENV_FILE,'.env.integration');assert.equal(process.env.HAVEN_CONTAINER_TESTS,'true');
const requireApi=createRequire(new URL('../../apps/api/package.json',import.meta.url)),{Pool}=requireApi('pg'),sharp=requireApi('sharp');
const privileged=new Pool({connectionString:process.env.MIGRATION_DATABASE_URL});
const fixture=JSON.parse(readFileSync('infra/generated/integration/gsplat/fixture.json','utf8')),engine=fixture.engine;
const actor:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']};
const api=new DigitizationFrameController({actor:async()=>actor} as unknown as Identity),input={workspaceVersion:2,inputRevision:1,cameraReportId:fixture.review.artifactId};
const req=()=>({method:'POST',url:`/api/v1/ops/digitizations/${engine}/scene-training`,headers:{'idempotency-key':randomUUID()}} as FastifyRequest);
const context=await transaction(actor,c=>trainingContext(c,actor,engine,input)),key=randomBytes(32),keyPath='infra/generated/integration/gsplat/functional-only.key',slotId=randomUUID(),runs:string[]=[];
const digest=(body:Buffer)=>createHash('sha256').update(body).digest('hex'),splats=Buffer.alloc(32*16);
for(let i=0;i<16;i++){for(let axis=0;axis<3;axis++){splats.writeFloatLE(i+axis,i*32+axis*4);splats.writeFloatLE(.2,i*32+12+axis*4);}splats.set([128,64,255,128,255,128,128,128],i*32+24);}
const png=await sharp({create:{width:16,height:16,channels:3,background:'#808080'}}).png().toBuffer(),ply=Buffer.concat([Buffer.from('ply\nformat binary_little_endian 1.0\nelement vertex 16\n'+['x','y','z','f_dc_0','f_dc_1','f_dc_2','opacity','scale_0','scale_1','scale_2','rot_0','rot_1','rot_2','rot_3'].map(name=>`property float ${name}\n`).join('')+'end_header\n'),Buffer.alloc(16*56)]);
const output=(kind:string,body:Buffer,more:object)=>({kind,sha256:digest(body),byteSize:String(body.length),...more});
const result=digitizationTrainingResult.parse({processingProfile:gsplatTrainingProfile,inputArchiveSha256:context.source.sha256,datasetFingerprint:context.datasetFingerprint,state:'awaiting_review',iterations:500,fallbacks:0,elapsedSeconds:1,splatCount:16,heldOutMetrics:[{frame:'authored-transport-fixture.png',meanSquaredError:.25,psnrDb:6.020599913279624,width:16,height:16}],outputs:[output('splat_scene',ply,{mime:'application/x-ply',splatCount:16}),...['mobile','desktop'].map(tier=>output('splat_training_tier',splats,{mime:'application/octet-stream',splatCount:16,tier,encoding:'splat32-wxyz-v1'})),output('held_out_render',png,{mime:'image/png',index:0,width:16,height:16})],scale:null,roomCoverage:null,humanRenderReviewRequired:true,publiclyServed:false});
const bodies=new Map([ply,splats,png].map(b=>[digest(b),b]));let mode:'success'|'hold'|'failure'='success',tamper=false,uploads=0;
const executions=new Map<string,{request:any;state:string}>();
const server=createServer(async(request,response)=>{
 try{
  const pieces:Buffer[]=[];for await(const part of request)pieces.push(part);const body=Buffer.concat(pieces),path=request.url!.split('/'),authorization=request.headers.authorization?.slice(7).split('.');
  assert.ok(authorization?.length===2);const signature=createHmac('sha256',key).update(authorization[0]).digest(),supplied=Buffer.from(authorization[1],'base64url');assert.equal(supplied.length,signature.length);assert.ok(timingSafeEqual(supplied,signature));const grant=JSON.parse(Buffer.from(authorization[0],'base64url').toString());assert.equal(grant.aud,'haven-processing-v1');assert.ok(grant.expiresAt>Date.now()/1000);
  const decoded=request.method==='POST'&&request.headers['content-type']==='application/json'?JSON.parse(body.toString()):null,id=path.length===2?decoded.executionId:path[2];assert.equal(grant.executionId,id);
  if(path.length===2){assert.ok(grant.actions.includes('submit'));assert.equal(executionRequestDigest(decoded),grant.requestDigest);if(!executions.has(id))executions.set(id,{request:decoded,state:'awaiting_source'});}
  const entry=executions.get(id)!;assert.ok(entry);assert.equal(executionRequestDigest(entry.request),grant.requestDigest);
  if(path[3]==='sources'){assert.ok(grant.actions.includes('source'));assert.equal(digest(body),entry.request.artifacts[0].checksum);assert.equal(String(body.length),entry.request.artifacts[0].byteSize);uploads++;entry.state=mode==='hold'?'running':mode==='failure'?'failed_terminal':'succeeded';}
  if(path[3]==='cancel'){assert.ok(grant.actions.includes('cancel'));entry.state='cancelled';}
  if(path[3]==='training-outputs'){assert.ok(grant.actions.includes('preview'));const output=result.outputs.find(o=>o.sha256===path[4])!;assert.ok(output);response.writeHead(200,{'Content-Type':output.mime,'Content-Length':output.byteSize});response.end(bodies.get(path[4]));return;}
  const data={executionId:id,state:entry.state,processStopped:entry.state!=='running',errorCode:entry.state==='failed_terminal'?'GPU_TRAINING_FAILED':null,result:entry.state==='succeeded'?{...result,datasetFingerprint:tamper?'f'.repeat(64):result.datasetFingerprint}:null};
  response.writeHead(200,{'Content-Type':'application/json'});response.end(JSON.stringify({data}));
 }catch{response.writeHead(403,{'Content-Type':'application/json'});response.end(JSON.stringify({error:{code:'TEST_RUNNER_REQUEST_REJECTED'}}));}
});
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');const origin=`http://127.0.0.1:${address.port}`,client=new CpuRunnerClient(origin,key);
async function handoff(run:string,kind:string){return transaction(actor,async c=>{const event=(await c.query('SELECT id FROM outbox WHERE aggregate_id=$1 AND kind=$2 AND payload->>\'runId\'=$3 ORDER BY created_at DESC LIMIT 1',[engine,kind,run])).rows[0];const receipt=await consumeDigitizationEvent(c,actor,event.id,engine,run);assert.equal(receipt.executions.length,1);return receipt.executions[0];});}
const start=(h:any)=>startCpuExecution(actor,engine,h.stageId,h.executionId,h.fencingToken,h.assetId,client),collect=(h:any)=>collectCpuRenders(actor,engine,h.stageId,h.executionId,h.fencingToken,h.assetId,client);
try{
 delete process.env.PROCESSING_ENABLE_GSPLAT_INVESTIGATION;
 await assert.rejects(api.train(req(),engine,input),{status:422});
 Object.assign(process.env,{PROCESSING_ENABLE_GSPLAT_INVESTIGATION:'true',PROCESSING_DEPLOYMENT:'test',DIGITIZATION_GPU_RUNNER_ORIGIN:origin,DIGITIZATION_GPU_SIGNING_KEY_FILE:'/workspace/'+keyPath});writeFileSync(keyPath,key,{mode:0o600});
 await privileged.query('INSERT INTO digitization_gpu_slots(id,resource_key,enabled,profiles) VALUES($1,$2,true,$3)',[slotId,'authored-transport-test-'+slotId,[gsplatTrainingProfile]]);
 const request=req(),run=(await api.train(request,engine,input)).data;runs.push(run.id);assert.deepEqual((await api.train(request,engine,input)).data,run);
 await assert.rejects(api.train(req(),engine,{...input,workspaceVersion:3}),{status:409});await assert.rejects(api.train(req(),engine,input),{status:409});
 const training=await handoff(run.id,'digitization.run_queued');await start(training);tamper=true;await assert.rejects(collect(training),{status:422});assert.equal(await transaction(actor,async c=>(await c.query('SELECT count(*)::int n FROM artifacts WHERE stage_id=$1',[training.stageId])).rows[0].n),0);tamper=false;
 const trained=await collect(training);assert.equal(trained.artifactIds.length,5);assert.deepEqual(await collect(training),trained);
 const exportJob=await handoff(run.id,'digitization.stage_completed');await start(exportJob);const exported=await collect(exportJob);assert.equal(exported.artifactIds.length,2);assert.deepEqual(await collect(exportJob),exported);
 const tiers=(await transaction(actor,c=>privateSceneTiers(c,actor,engine))).filter(tier=>exported.artifactIds.includes(tier.id));assert.equal(tiers.length,2);assert.deepEqual(await readPrivateSceneTier(actor,engine,tiers[0].id),splats);
 const ready=await transaction(actor,c=>readReconstructionStatus(c,actor,engine));assert.equal(ready.sceneTraining.job?.state,'awaiting_review');assert.equal(ready.sceneTraining.job?.artifactIds.length,2);
 const foreign={...actor,id:'00000000-0000-4000-8000-000000000011',orgId:'10000000-0000-4000-8000-000000000005',roles:['agency_manager']};await assert.rejects(transaction(foreign,c=>readReconstructionStatus(c,foreign,engine)));
 mode='hold';const stopped=(await api.train(req(),engine,input)).data;runs.push(stopped.id);const active=await handoff(stopped.id,'digitization.run_queued');await start(active);
 await transaction(actor,async c=>{const version=(await c.query('SELECT version FROM processing_runs WHERE id=$1',[stopped.id])).rows[0].version;await requestRunCancellation(c,actor,engine,stopped.id,version);});assert.equal((await completeRunCancellation(actor,engine,stopped.id,client)).state,'cancelled');await assert.rejects(collect(active),{status:409});
 mode='failure';const failed=(await api.train(req(),engine,input)).data;runs.push(failed.id);const failing=await handoff(failed.id,'digitization.run_queued');await start(failing);await assert.rejects(collect(failing),{status:422});
 assert.equal((await privileged.query('SELECT stage_id FROM digitization_gpu_slots WHERE id=$1',[slotId])).rows[0].stage_id,null);
 console.log(JSON.stringify({label:'P',scope:'real private API/SQL/S3/signed HTTP orchestration with authored runner output; no CUDA execution',trainingStages:3,privateExportedTiers:2,sourceUploads:uploads,idempotency:true,tamperedLineageRejected:true,foreignScopeRejected:true,staleVersionRejected:true,cancellationFenced:true,failedTrainingReleasedReservation:true,gpuValidated:false,publiclyServed:false}));
}finally{
 for(const id of runs){try{const row=await transaction(actor,async c=>(await c.query('SELECT state,version FROM processing_runs WHERE id=$1',[id])).rows[0]);if(row&&['queued','running','draft'].includes(row.state)){await transaction(actor,c=>requestRunCancellation(c,actor,engine,id,row.version));await completeRunCancellation(actor,engine,id,client);}}catch{console.error('Test job needs isolated cleanup: '+id);}}
 await privileged.query('DELETE FROM digitization_gpu_slots WHERE id=$1 AND stage_id IS NULL',[slotId]);server.close();try{unlinkSync(keyPath);}catch{/* no key was created on an earlier failure */}await privileged.end();await pool.end();
}
