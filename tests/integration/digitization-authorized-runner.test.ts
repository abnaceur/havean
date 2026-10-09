import '../support/env';
import {afterAll,expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {createIntake} from '../../apps/api/src/inventory/digitization/intakes';
import {appendInputRevision} from '../../apps/api/src/inventory/digitization/inputs';
import {verifySmallDigitizationSource} from '../../apps/api/src/inventory/digitization/source-validation';
import {captureStorage} from '../../apps/api/src/inventory/digitization/multipart';
import {cpuSourceFingerprint,prepareCpuExecution} from '../../apps/api/src/inventory/digitization/execution-scope';
import {createRunGraph} from '../../apps/api/src/inventory/digitization/workflow';
import {leaseStage} from '../../apps/api/src/inventory/digitization/leases';
import {startCpuExecution} from '../../apps/api/src/inventory/digitization/execution-start';
import {CpuRunnerClient} from '../../apps/api/src/inventory/digitization/runner-client';
import {requestRunCancellation,completeRunCancellation} from '../../apps/api/src/inventory/digitization/cancellation';
import {collectCpuRenders} from '../../apps/api/src/inventory/digitization/execution-results';
import {readPlanPageSelection} from '../../apps/api/src/inventory/digitization/plan-selection';
import {mapPlanPoint} from '../../apps/api/src/inventory/digitization/plan-page';
import {readGeometryDraft,saveGeometryDraft} from '../../apps/api/src/inventory/digitization/geometry-drafts';
import type {DigitizationGeometryRevision} from '@haven/contracts';
import {scanFile} from '../../apps/api/src/inventory/scanner';
const origin=process.env.DIGITIZATION_RUNNER_TEST_ORIGIN,requireApi=createRequire(new URL('../../apps/api/package.json',import.meta.url)),sharp=requireApi('sharp'),{CreateBucketCommand,PutObjectCommand,DeleteObjectCommand}=requireApi('@aws-sdk/client-s3');
const actor:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']};
afterAll(()=>pool.end());
async function closeFixtureRun(engine:string,run:string|undefined,client:CpuRunnerClient){if(!run)return;const row=await transaction(actor,async c=>(await c.query('SELECT version,state FROM processing_runs WHERE id=$1',[run])).rows[0]);if(!row||['ready','cancelled'].includes(row.state))return;await transaction(actor,c=>requestRunCancellation(c,actor,engine,run,row.version));await completeRunCancellation(actor,engine,run,client);}
it.skipIf(!origin)('current API-owned lease transfers real scoped S3 input to the CPU runner and cancels a superseded acknowledgement',async()=>{
 const storage=captureStorage(),key=crypto.randomUUID(),bytes=await sharp({create:{width:32,height:24,channels:3,background:'#185b48'}}).png().toBuffer(),workspace=await transaction(actor,c=>createIntake(c,actor));
 let fixtureRunId:string|undefined;const cleanupClient=new CpuRunnerClient(origin!,Buffer.from('test-only-private-key-not-a-production-credential-0000'));
 const asset=await transaction(actor,async c=>(await c.query("INSERT INTO media_assets(owner_id,object_key,mime,size,rights,visibility,purpose,status,scan_at) VALUES($1,$2,'image/png',$3,'Synthetic integration scan metadata only','private','floor_plan','approved',now()) RETURNING id,version",[actor.id,key,bytes.length])).rows[0]);
 try{
  try{await storage.send(new CreateBucketCommand({Bucket:'haven-private'}));}catch(error:any){if(!['BucketAlreadyExists','BucketAlreadyOwnedByYou'].includes(error.name))throw error;}
  await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key,Body:bytes}));
  const verified=await verifySmallDigitizationSource(actor,workspace.id,asset.id,asset.version,1,'plan');
  await transaction(actor,c=>appendInputRevision(c,actor,workspace.id,1,[verified]));
  const stageId=crypto.randomUUID(),runId=crypto.randomUUID(),fingerprint=await transaction(actor,async c=>cpuSourceFingerprint(workspace.id,actor.orgId!,1,'upright-image-v1',(await c.query('SELECT source_set FROM property_input_revisions WHERE digitization_id=$1 AND revision=1',[workspace.id])).rows[0].source_set[0]));
  fixtureRunId=runId;
  await transaction(actor,c=>createRunGraph(c,actor,workspace.id,2,{schemaVersion:1,id:runId,organizationId:actor.orgId!,creatorId:actor.id,target:{type:'intake',id:workspace.id},inputRevision:1,state:'draft',version:1,stages:[{id:stageId,type:'document_rasterize',state:'pending',dependencies:[],profileId:'upright-image-v1',inputFingerprint:fingerprint,inputRevision:1,attempt:0,fencingToken:null,executionId:null,progress:null}],deadline:new Date(Date.now()+120000).toISOString(),budget:{maxSeconds:30,maxScratchBytes:'67108864'}},['plan']));
  const lease=await transaction(actor,async c=>{await c.query("UPDATE processing_runs SET state='queued',version=version+1 WHERE id=$1",[runId]);await c.query("UPDATE processing_stages SET state='queued',version=version+1 WHERE id=$1",[stageId]);return leaseStage(c,actor,workspace.id,stageId,2);});
  const client=new CpuRunnerClient(origin!,Buffer.from('test-only-private-key-not-a-production-credential-0000'));
  const request=await transaction(actor,c=>prepareCpuExecution(c,actor,workspace.id,stageId,lease.execution_id,'1',asset.id));
  await expect(startCpuExecution(actor,workspace.id,stageId,lease.execution_id,'2',asset.id,client)).rejects.toMatchObject({status:409});
  const acknowledgement=await startCpuExecution(actor,workspace.id,stageId,lease.execution_id,'1',asset.id,client);
  expect(acknowledgement.executionId).toBe(lease.execution_id);expect(Object.keys(acknowledgement).sort()).toEqual(['executionId','state']);
  let state=await client.read(request);const deadline=Date.now()+10000;
  while(['pending','running'].includes(state.state)&&Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,100));state=await client.read(request);}
  expect(state.state).toBe('succeeded');
  expect((await startCpuExecution(actor,workspace.id,stageId,lease.execution_id,'1',asset.id,client)).state).toBe('succeeded');
  await transaction(actor,async c=>{expect((await c.query('SELECT count(*)::int n FROM stage_attempts WHERE stage_id=$1',[stageId])).rows[0].n).toBe(1);});
  const altered=await sharp({create:{width:32,height:24,channels:3,background:'#185b49'}}).png().toBuffer();
  expect(altered.length).toBe(bytes.length);
  await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key,Body:altered}));
  const submitGuard=vi.spyOn(client,'submit');
  await expect(startCpuExecution(actor,workspace.id,stageId,lease.execution_id,'1',asset.id,client)).rejects.toMatchObject({status:409});
  expect(submitGuard).not.toHaveBeenCalled();submitGuard.mockRestore();
  await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key,Body:bytes}));
  // Fault injection: supersede inputs between runner acknowledgement and API commit.
  const submit=client.submit.bind(client),cancel=vi.spyOn(client,'cancel');
  vi.spyOn(client,'submit').mockImplementationOnce(async(...args)=>{const result=await submit(...args);await transaction(actor,c=>appendInputRevision(c,actor,workspace.id,2,[]));return result;});
  await expect(startCpuExecution(actor,workspace.id,stageId,lease.execution_id,'1',asset.id,client)).rejects.toMatchObject({status:409});
  expect(cancel).toHaveBeenCalledWith(request);
  await transaction(actor,async c=>{expect((await c.query('SELECT state FROM processing_stages WHERE id=$1',[stageId])).rows[0].state).toBe('running');expect((await c.query('SELECT count(*)::int n FROM artifacts WHERE stage_id=$1',[stageId])).rows[0].n).toBe(0);});
 }finally{vi.restoreAllMocks();await closeFixtureRun(workspace.id,fixtureRunId,cleanupClient);await storage.send(new DeleteObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key}));storage.destroy();}
},30000);

function blankPdf(size=200){
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>',`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${size} ${size}] >>`];
 let pdf='%PDF-1.4\n';const offsets=[];
 for(const [index,object] of objects.entries()){offsets.push(Buffer.byteLength(pdf));pdf+=`${index+1} 0 obj\n${object}\nendobj\n`;}
 const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 4\n0000000000 65535 f \n${offsets.map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 return Buffer.from(pdf);
}
it.skipIf(!origin).each(['upright-image-v1','pdfium-150dpi-v1','pdfium-overbudget'])('real CPU %s renders commit privately with checksum lineage and replay; invalid, revoked and superseded results cannot commit',async requestedProfile=>{
 const overBudget=requestedProfile==='pdfium-overbudget',profile=overBudget?'pdfium-150dpi-v1':requestedProfile;
 const isPdf=profile==='pdfium-150dpi-v1',mime=isPdf?'application/pdf':'image/png',purpose=isPdf?'document' as const:'plan' as const;
 const storage=captureStorage(),key=crypto.randomUUID(),bytes=isPdf?blankPdf(overBudget?14400:200):await sharp({create:{width:32,height:24,channels:3,background:'#185b48'}}).png().toBuffer(),workspace=await transaction(actor,c=>createIntake(c,actor));
 await scanFile(bytes);
 let fixtureRunId:string|undefined;const cleanupClient=new CpuRunnerClient(origin!,Buffer.from('test-only-private-key-not-a-production-credential-0000'));
 const asset=await transaction(actor,async c=>(await c.query("INSERT INTO media_assets(owner_id,object_key,mime,size,rights,visibility,purpose,status,scan_at) VALUES($1,$2,$3,$4,'Synthetic runner render fixture','private',$5,'approved',now()) RETURNING id,version",[actor.id,key,mime,bytes.length,isPdf?'document':'floor_plan'])).rows[0]);
 const renderedKeys:string[]=[];
 try{
  try{await storage.send(new CreateBucketCommand({Bucket:'haven-private'}));}catch(error:any){if(!['BucketAlreadyExists','BucketAlreadyOwnedByYou'].includes(error.name))throw error;}
  await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key,Body:bytes}));
  const verified=await verifySmallDigitizationSource(actor,workspace.id,asset.id,asset.version,1,purpose);
  await transaction(actor,c=>appendInputRevision(c,actor,workspace.id,1,[verified]));
  const stageId=crypto.randomUUID(),runId=crypto.randomUUID(),fingerprint=await transaction(actor,async c=>cpuSourceFingerprint(workspace.id,actor.orgId!,1,profile,(await c.query('SELECT source_set FROM property_input_revisions WHERE digitization_id=$1 AND revision=1',[workspace.id])).rows[0].source_set[0]));
  const dependentId=crypto.randomUUID();
  const firstStage={id:stageId,type:'document_rasterize' as const,state:'pending' as const,dependencies:[],profileId:profile,inputFingerprint:fingerprint,inputRevision:1,attempt:0,fencingToken:null,executionId:null,progress:null};
  fixtureRunId=runId;
  await transaction(actor,c=>createRunGraph(c,actor,workspace.id,2,{schemaVersion:1,id:runId,organizationId:actor.orgId!,creatorId:actor.id,target:{type:'intake',id:workspace.id},inputRevision:1,state:'draft',version:1,stages:[firstStage,{...firstStage,id:dependentId,dependencies:[stageId]}],deadline:new Date(Date.now()+120000).toISOString(),budget:{maxSeconds:30,maxScratchBytes:'67108864'}},['plan']));
  let lease=await transaction(actor,async c=>{await c.query("UPDATE processing_runs SET state='queued',version=version+1 WHERE id=$1",[runId]);await c.query("UPDATE processing_stages SET state='queued',version=version+1 WHERE id=$1",[stageId]);return leaseStage(c,actor,workspace.id,stageId,2);});
  const client=new CpuRunnerClient(origin!,Buffer.from('test-only-private-key-not-a-production-credential-0000'));
  const request=await transaction(actor,c=>prepareCpuExecution(c,actor,workspace.id,stageId,lease.execution_id,String(lease.fencing_token),asset.id));
  await startCpuExecution(actor,workspace.id,stageId,lease.execution_id,String(lease.fencing_token),asset.id,client);
  let state=await client.read(request);const deadline=Date.now()+10000;
  while(['pending','running'].includes(state.state)&&Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,100));state=await client.read(request);}
  if(overBudget){
   expect(state.state).toBe('failed_terminal');expect(state.errorCode).toBe('RASTER_BUDGET_EXCEEDED');
   await expect(collectCpuRenders(actor,workspace.id,stageId,lease.execution_id,String(lease.fencing_token),asset.id,client)).rejects.toMatchObject({status:422});
   expect(await transaction(actor,async c=>(await c.query('SELECT state FROM processing_stages WHERE id=$1',[stageId])).rows[0].state)).toBe('failed_terminal');
   expect(await transaction(actor,async c=>(await c.query('SELECT count(*)::int n FROM artifacts WHERE stage_id=$1',[stageId])).rows[0].n)).toBe(0);
   expect(await transaction(actor,async c=>(await c.query('SELECT state FROM processing_stages WHERE id=$1',[dependentId])).rows[0].state)).toBe('pending');
   return;
  }
  expect(state.state).toBe('succeeded');
  vi.spyOn(client,'read').mockResolvedValueOnce({...state,result:{image:{sha256:'a'.repeat(64),width:30000000,height:2,coordinateSpace:'upright-page-normalized-top-left',originalToUpright:[1,0,0,0,1,0,0,0,1]}}});
  await expect(collectCpuRenders(actor,workspace.id,stageId,lease.execution_id,String(lease.fencing_token),asset.id,client)).rejects.toMatchObject({status:422});
  await expect(collectCpuRenders(actor,workspace.id,stageId,lease.execution_id,'2',asset.id,client)).rejects.toMatchObject({status:409});
  const previewCall=client.preview.bind(client);
  vi.spyOn(client,'preview').mockImplementationOnce(async(...args)=>{
   const body=await previewCall(...args);
   await transaction({id:'00000000-0000-4000-8000-000000000010',orgId:null,roles:['admin']},c=>c.query("UPDATE memberships SET status='inactive',version=version+1 WHERE user_id=$1 AND organization_id=$2 AND role='agent'",[actor.id,actor.orgId]));
   return body;
  });
  try{
   await expect(collectCpuRenders(actor,workspace.id,stageId,lease.execution_id,String(lease.fencing_token),asset.id,client)).rejects.toMatchObject({status:403});
  }finally{
   await transaction({id:'00000000-0000-4000-8000-000000000010',orgId:null,roles:['admin']},c=>c.query("UPDATE memberships SET status='active',version=version+1 WHERE user_id=$1 AND organization_id=$2 AND role='agent'",[actor.id,actor.orgId]));
  }
  expect(await transaction(actor,async c=>(await c.query('SELECT count(*)::int n FROM artifacts WHERE stage_id=$1',[stageId])).rows[0].n)).toBe(0);
  if(!isPdf){
   const expired=lease;
   await transaction(actor,c=>c.query("UPDATE processing_stages SET lease_until=statement_timestamp()+interval '20 milliseconds',version=version+1 WHERE id=$1",[stageId]));
   await new Promise(resolve=>setTimeout(resolve,40));
   await expect(collectCpuRenders(actor,workspace.id,stageId,expired.execution_id,String(expired.fencing_token),asset.id,client)).rejects.toMatchObject({status:409});
   lease=await transaction(actor,async c=>{
    await c.query("UPDATE processing_stages SET state='failed_retryable',version=version+1 WHERE id=$1",[stageId]);
    const queued=(await c.query("UPDATE processing_stages SET state='queued',version=version+1 WHERE id=$1 RETURNING version",[stageId])).rows[0];
    return leaseStage(c,actor,workspace.id,stageId,queued.version);
   });
   expect(String(lease.fencing_token)).toBe('2');
   await startCpuExecution(actor,workspace.id,stageId,lease.execution_id,String(lease.fencing_token),asset.id,client);
   const replacement=await transaction(actor,c=>prepareCpuExecution(c,actor,workspace.id,stageId,lease.execution_id,String(lease.fencing_token),asset.id));
   await expect.poll(async()=>(await client.read(replacement)).state,{timeout:10000}).toBe('succeeded');
   await expect(collectCpuRenders(actor,workspace.id,stageId,expired.execution_id,String(expired.fencing_token),asset.id,client)).rejects.toMatchObject({status:409});
   expect(await transaction(actor,async c=>(await c.query('SELECT execution_id FROM processing_stages WHERE id=$1',[stageId])).rows[0].execution_id)).toBe(lease.execution_id);
  }
  const result=await collectCpuRenders(actor,workspace.id,stageId,lease.execution_id,String(lease.fencing_token),asset.id,client);
  expect(result.state).toBe('succeeded');expect(result.artifactIds).toHaveLength(1);
  expect(await collectCpuRenders(actor,workspace.id,stageId,lease.execution_id,String(lease.fencing_token),asset.id,client)).toEqual(result);
  const selection=await readPlanPageSelection(actor,workspace.id,result.artifactIds[0],90);
  expect(selection).toMatchObject({artifactId:result.artifactIds[0],inputRevision:1,workspaceVersion:2,unit:'px',scaleStatus:'unscaled',source:{kind:'asset',assetId:asset.id,page:1}});
  expect(selection.width).toBeCloseTo(isPdf?417:24);expect(selection.height).toBeCloseTo(isPdf?417:32);
  const original={x:10,y:12},editor=mapPlanPoint(selection.source.originalToModel,original),restored=mapPlanPoint(selection.modelToOriginal,editor);
  expect(restored.x).toBeCloseTo(original.x);expect(restored.y).toBeCloseTo(original.y);
  expect(await readPlanPageSelection(actor,workspace.id,result.artifactIds[0],90)).toEqual(selection);
  await expect(readPlanPageSelection({...actor,orgId:'10000000-0000-4000-8000-000000000005'},workspace.id,result.artifactIds[0],0)).rejects.toMatchObject({status:403});
  await transaction(actor,async c=>{
   const artifacts=(await c.query('SELECT * FROM artifacts WHERE stage_id=$1',[stageId])).rows;
   expect(artifacts).toHaveLength(1);renderedKeys.push(artifacts[0].object_key);
   expect(artifacts[0]).toMatchObject({status:'private',privacy_status:'pending',input_revision:1,input_fingerprint:fingerprint,profile_id:profile});
   expect(artifacts[0].quality_report).toMatchObject({page:1,width:isPdf?417:32,height:isPdf?417:24,requiresOcr:true});
   expect(JSON.stringify(result)).not.toContain('object_key');
   expect((await c.query("SELECT count(*)::int n FROM outbox WHERE aggregate_id=$1 AND kind='digitization.stage_completed'",[workspace.id])).rows[0].n).toBe(1);
   expect((await c.query('SELECT state FROM processing_stages WHERE id=$1',[stageId])).rows[0].state).toBe('succeeded');
   expect((await c.query('SELECT state,version FROM processing_stages WHERE id=$1',[dependentId])).rows[0]).toEqual({state:'queued',version:2});
  });
  let sourceEditVersion=2;
  if(profile==='upright-image-v1'){
   expect(await transaction(actor,c=>readGeometryDraft(c,actor,workspace.id))).toBeNull();
   const geometry:DigitizationGeometryRevision={schemaVersion:2,id:crypto.randomUUID(),organizationId:actor.orgId!,targetId:workspace.id,revision:1,parentRevision:null,coordinateSystem:'right-handed-z-up',unit:'px',scaleStatus:'unscaled',sourceAssets:[asset.id],sources:[selection.source],scaleAnchors:[],floors:[{id:'ground',name:'Ground',elevation:'0',height:null,source:selection.source}],rooms:[],walls:[{id:'wall-1',floorId:'ground',start:{x:2,y:4},end:{x:20,y:4},thickness:'3',height:null,source:selection.source,confirmed:false}],openings:[],stairs:[],review:{status:'pending',actorId:null}};
   const save={version:2,artifactId:result.artifactIds[0],clockwiseDegrees:90,geometry};
   await expect(transaction(actor,c=>saveGeometryDraft(c,actor,workspace.id,{...save,geometry:{...geometry,targetId:crypto.randomUUID()}},selection))).rejects.toMatchObject({status:403});
   await expect(transaction(actor,c=>saveGeometryDraft(c,actor,workspace.id,{...save,geometry:{...geometry,review:{status:'confirmed',actorId:actor.id}}},selection))).rejects.toMatchObject({status:422});
   await expect(transaction(actor,c=>saveGeometryDraft(c,actor,workspace.id,{...save,geometry:{...geometry,sources:[{...selection.source,originalToModel:[1,0,0,0,1,0,0,0,1]}]}},selection))).rejects.toMatchObject({status:422});
   const initial=await transaction(actor,c=>saveGeometryDraft(c,actor,workspace.id,save,selection));
   expect(initial.workspaceVersion).toBe(3);expect((await transaction(actor,c=>readGeometryDraft(c,actor,workspace.id)))?.geometry.walls[0].end).toEqual({x:20,y:4});
   await expect(transaction(actor,c=>saveGeometryDraft(c,actor,workspace.id,save,selection))).rejects.toMatchObject({status:409});
   const currentSelection=await readPlanPageSelection(actor,workspace.id,result.artifactIds[0],90);
   const next={...save,version:3,geometry:{...geometry,id:crypto.randomUUID(),revision:2,parentRevision:1,walls:[{...geometry.walls[0],end:{x:22,y:6}}]}};
   const competing=await Promise.allSettled([transaction(actor,c=>saveGeometryDraft(c,actor,workspace.id,next,currentSelection)),transaction(actor,c=>saveGeometryDraft(c,actor,workspace.id,{...next,geometry:{...next.geometry,id:crypto.randomUUID()}},currentSelection))]);
   expect(competing.filter(r=>r.status==='fulfilled'),JSON.stringify(competing.map(r=>r.status==='rejected'?{code:r.reason.code,status:r.reason.status,message:r.reason.message}:null))).toHaveLength(1);expect(competing.filter(r=>r.status==='rejected').map(r=>r.status==='rejected'?r.reason.status:null)).toEqual([409]);
   const reloaded=await transaction(actor,c=>readGeometryDraft(c,actor,workspace.id));expect(reloaded?.geometry.walls[0].end).toEqual({x:22,y:6});expect(reloaded?.geometry).toMatchObject({revision:2,parentRevision:1,unit:'px',scaleStatus:'unscaled',review:{status:'pending',actorId:null}});
   await expect(transaction({...actor,orgId:'10000000-0000-4000-8000-000000000005'},c=>readGeometryDraft(c,{...actor,orgId:'10000000-0000-4000-8000-000000000005'},workspace.id))).rejects.toMatchObject({status:403});
   await transaction(actor,async c=>{const rows=(await c.query('SELECT geometry FROM geometry_revisions WHERE digitization_id=$1 ORDER BY revision',[workspace.id])).rows;expect(rows).toHaveLength(2);expect(rows[0].geometry.walls[0].end).toEqual({x:20,y:4});});
   sourceEditVersion=4;
  }
  await transaction(actor,c=>appendInputRevision(c,actor,workspace.id,sourceEditVersion,[]));
  if(profile==='upright-image-v1')await expect(transaction(actor,c=>readGeometryDraft(c,actor,workspace.id))).rejects.toMatchObject({status:409});
  await expect(readPlanPageSelection(actor,workspace.id,result.artifactIds[0],90)).rejects.toMatchObject({status:409});
  await expect(collectCpuRenders(actor,workspace.id,stageId,lease.execution_id,String(lease.fencing_token),asset.id,client)).rejects.toMatchObject({status:409});
 }finally{vi.restoreAllMocks();await closeFixtureRun(workspace.id,fixtureRunId,cleanupClient);for(const objectKey of [key,...renderedKeys])await storage.send(new DeleteObjectCommand({Bucket:'haven-private',Key:objectKey===key?'quarantine/'+key:objectKey}));storage.destroy();}
},30000);
