import '../support/env';
import {afterAll,expect,it} from 'vitest';
import {createRequire} from 'node:module';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {createIntake} from '../../apps/api/src/inventory/digitization/intakes';
import {appendInputRevision} from '../../apps/api/src/inventory/digitization/inputs';
import {createRunGraph} from '../../apps/api/src/inventory/digitization/workflow';
import {verifySmallDigitizationSource} from '../../apps/api/src/inventory/digitization/source-validation';
import {captureStorage} from '../../apps/api/src/inventory/digitization/multipart';
import {cpuSourceFingerprint,prepareCpuExecution} from '../../apps/api/src/inventory/digitization/execution-scope';
import {DigitizationInputController} from '../../apps/api/src/inventory/digitization/input-controller';
import type {Identity} from '../../apps/api/src/platform/core';
import {DigitizationWorkerController} from '../../apps/api/src/inventory/digitization/worker-controller';
import {digitizationWorkerHeaders} from '../../packages/config/src/index';
import type {FastifyRequest} from 'fastify';
const requireApi=createRequire(new URL('../../apps/api/package.json',import.meta.url)),sharp=requireApi('sharp'),{CreateBucketCommand,PutObjectCommand,DeleteObjectCommand}=requireApi('@aws-sdk/client-s3');
const actor:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']};
afterAll(()=>pool.end());
it('HE-B05 real stored source binds immutable revisions; removal does not mutate existing run snapshots',async()=>{
 const workspace=await transaction(actor,c=>createIntake(c,actor)),key=crypto.randomUUID(),bytes=await sharp({create:{width:32,height:32,channels:3,background:'#185b48'}}).png().toBuffer();
 // Already-scanned fixture isolates revision behavior; it does not replace scan acceptance.
 const asset=await transaction(actor,async c=>(await c.query("INSERT INTO media_assets(owner_id,object_key,mime,size,rights,visibility,purpose,status,scan_at) VALUES($1,$2,'image/png',$3,'Synthetic owned plan image fixture','private','floor_plan','approved',now()) RETURNING id,version",[actor.id,key,bytes.length])).rows[0]);
 const storage=captureStorage();
 try{
  try{await storage.send(new CreateBucketCommand({Bucket:'haven-private'}));}catch(e:any){if(!['BucketAlreadyOwnedByYou','BucketAlreadyExists'].includes(e.name)&&e.$metadata?.httpStatusCode!==409)throw e;}
  await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key,Body:bytes}));
  const verified=await verifySmallDigitizationSource(actor,workspace.id,asset.id,asset.version,1,'plan');
  const first=await transaction(actor,c=>appendInputRevision(c,actor,workspace.id,workspace.version,[verified]));expect(first).toMatchObject({inputRevision:1,version:2,processingEligible:false});
  const runId=crypto.randomUUID(),stageId=crypto.randomUUID();
  const fingerprint=await transaction(actor,async c=>cpuSourceFingerprint(workspace.id,actor.orgId!,1,'upright-image-v1',(await c.query('SELECT source_set FROM property_input_revisions WHERE digitization_id=$1 AND revision=1',[workspace.id])).rows[0].source_set[0]));
  await transaction(actor,c=>createRunGraph(c,actor,workspace.id,2,{schemaVersion:1,id:runId,organizationId:actor.orgId!,creatorId:actor.id,target:{type:'intake',id:workspace.id},inputRevision:1,state:'draft',version:1,stages:[{id:stageId,type:'document_rasterize',state:'pending',dependencies:[],profileId:'upright-image-v1',inputFingerprint:fingerprint,inputRevision:1,attempt:0,fencingToken:null,executionId:null,progress:null}],deadline:new Date(Date.now()+3600000).toISOString(),budget:{maxSeconds:300,maxScratchBytes:'67108864'}},['plan']));
  await transaction(actor,async c=>{
   await c.query("UPDATE processing_runs SET state='queued',version=version+1 WHERE id=$1",[runId]);
   await c.query("UPDATE processing_stages SET state='queued',version=version+1 WHERE id=$1",[stageId]);
  });
  const priorKey=process.env.DIGITIZATION_COORDINATOR_KEY,commandKey='3'.repeat(64),controller=new DigitizationWorkerController();
  process.env.DIGITIZATION_COORDINATOR_KEY=commandKey;
  const path=`/api/v1/internal/digitization/stages/${stageId}/lease`,command={engineId:workspace.id,actorId:actor.id,organizationId:actor.orgId!,expectedVersion:2};
  const request=(route:string,body:unknown,key=commandKey)=>({method:'POST',url:route,body,headers:digitizationWorkerHeaders('POST',route,body,key)} as unknown as FastifyRequest);
  let lease:any;
  try{
   await expect(controller.lease(request(path,command,'4'.repeat(64)),stageId,command)).rejects.toMatchObject({status:401});
   lease=(await controller.lease(request(path,command),stageId,command)).data;
   await expect(controller.lease(request(path,command),stageId,command)).rejects.toMatchObject({status:409});
   const preparePath=`/api/v1/internal/digitization/stages/${stageId}/prepare`,preparation={engineId:workspace.id,actorId:actor.id,organizationId:actor.orgId!,executionId:lease.execution_id,fencingToken:'1',assetId:asset.id};
   expect((await controller.prepare(request(preparePath,preparation),stageId,preparation)).data.artifacts[0].checksum).toBe(verified.sha256);
  }finally{if(priorKey===undefined)delete process.env.DIGITIZATION_COORDINATOR_KEY;else process.env.DIGITIZATION_COORDINATOR_KEY=priorKey;}
  const execution=await transaction(actor,c=>prepareCpuExecution(c,actor,workspace.id,stageId,lease.execution_id,'1',asset.id));
  expect(execution).toMatchObject({executionId:lease.execution_id,organizationId:actor.orgId,inputRevision:1,inputFingerprint:fingerprint,budget:{maxSeconds:15,maxScratchBytes:'67108864'},artifacts:[{id:asset.id,checksum:verified.sha256,byteSize:String(bytes.length),detectedMime:'image/png'}]});
  expect(JSON.stringify(execution)).not.toContain('quarantine/');
  await expect(transaction(actor,c=>prepareCpuExecution(c,actor,workspace.id,stageId,lease.execution_id,'2',asset.id))).rejects.toMatchObject({status:409});
  await expect(transaction(actor,c=>prepareCpuExecution(c,actor,workspace.id,stageId,lease.execution_id,'1',crypto.randomUUID()))).rejects.toMatchObject({status:404});
  await expect(transaction(actor,c=>appendInputRevision(c,actor,workspace.id,1,[]))).rejects.toMatchObject({status:409});
  expect(await transaction(actor,c=>appendInputRevision(c,actor,workspace.id,2,[]))).toMatchObject({inputRevision:2,version:3});
  await expect(transaction(actor,c=>prepareCpuExecution(c,actor,workspace.id,stageId,lease.execution_id,'1',asset.id))).rejects.toMatchObject({status:409});
  await transaction(actor,async c=>{
   const revisions=(await c.query('SELECT revision,source_set FROM property_input_revisions WHERE digitization_id=$1 ORDER BY revision',[workspace.id])).rows;
   expect(revisions).toHaveLength(2);expect(revisions[0].source_set).toHaveLength(1);expect(revisions[1].source_set).toEqual([]);
   expect(revisions[0].source_set[0]).toMatchObject({assetId:asset.id,sha256:verified.sha256,decoderState:'requires_isolated_image_decoder'});
   expect(JSON.stringify(revisions)).not.toContain('quarantine/');expect(JSON.stringify(revisions)).not.toContain('body');
   expect((await c.query('SELECT input_revision,state FROM processing_runs WHERE id=$1',[runId])).rows[0]).toEqual({input_revision:1,state:'running'});
   expect((await c.query('SELECT input_revision FROM digitization_asset_bindings WHERE id=$1',[first.bindingIds[0]])).rows[0].input_revision).toBe(1);
  });
  const inputController=new DigitizationInputController({actor:async()=>actor} as unknown as Identity);
  const bindingReq={method:'POST',url:`/api/v1/ops/digitization-intakes/${workspace.id}/asset-bindings`,headers:{'idempotency-key':crypto.randomUUID()}} as FastifyRequest;
  const bindingBody={version:3,inputRevision:3,assetId:asset.id,assetVersion:asset.version,purpose:'plan'};
  const restored=(await inputController.bindIntake(bindingReq,workspace.id,bindingBody)).data;
  expect(restored).toMatchObject({version:4,inputRevision:3,processingEligible:false});
  expect((await inputController.bindIntake(bindingReq,workspace.id,bindingBody)).data).toEqual(restored);
  await expect(inputController.bindIntake(bindingReq,workspace.id,{...bindingBody,purpose:'photo'})).rejects.toMatchObject({status:409});
  const removeReq={method:'DELETE',url:`/api/v1/ops/digitization-intakes/${workspace.id}/asset-bindings/${restored.bindingIds[0]}`,headers:{'idempotency-key':crypto.randomUUID()}} as FastifyRequest;
  const removal=(await inputController.removeIntake(removeReq,workspace.id,restored.bindingIds[0],{version:4,inputRevision:4})).data;
  expect(removal).toMatchObject({version:5,inputRevision:4,bindingIds:[],processingEligible:false});
  expect((await inputController.removeIntake(removeReq,workspace.id,restored.bindingIds[0],{version:4,inputRevision:4})).data).toEqual(removal);
  await expect(inputController.removeIntake({...removeReq,headers:{'idempotency-key':crypto.randomUUID()}},workspace.id,restored.bindingIds[0],{version:4,inputRevision:4})).rejects.toMatchObject({status:409});
  const foreign:Actor={id:'00000000-0000-4000-8000-000000000011',orgId:'10000000-0000-4000-8000-000000000005',roles:['agent']};
  await expect(new DigitizationInputController({actor:async()=>foreign} as unknown as Identity).bindIntake(bindingReq,workspace.id,bindingBody)).rejects.toMatchObject({status:404});
  await transaction(actor,async c=>{
   const snapshots=(await c.query('SELECT revision,source_set FROM property_input_revisions WHERE digitization_id=$1 ORDER BY revision',[workspace.id])).rows;
   expect(snapshots.map(row=>row.source_set.length)).toEqual([1,0,1,0]);
   expect((await c.query('SELECT input_revision FROM processing_runs WHERE id=$1',[runId])).rows[0].input_revision).toBe(1);
  });
 }finally{await storage.send(new DeleteObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key}));storage.destroy();}
});
