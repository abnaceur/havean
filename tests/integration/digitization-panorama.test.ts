import '../support/env';
import {afterAll,expect,it} from 'vitest';
import {createRequire} from 'node:module';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {createIntake} from '../../apps/api/src/inventory/digitization/intakes';
import {appendInputRevision} from '../../apps/api/src/inventory/digitization/inputs';
import {verifySmallDigitizationSource} from '../../apps/api/src/inventory/digitization/source-validation';
import {captureStorage} from '../../apps/api/src/inventory/digitization/multipart';
import {cpuSourceFingerprint,prepareCpuExecution} from '../../apps/api/src/inventory/digitization/execution-scope';
import {createRunGraph,dispatchRunGraph} from '../../apps/api/src/inventory/digitization/workflow';
import {leaseStage} from '../../apps/api/src/inventory/digitization/leases';
import {startCpuExecution} from '../../apps/api/src/inventory/digitization/execution-start';
import {CpuRunnerClient} from '../../apps/api/src/inventory/digitization/runner-client';
import {collectCpuRenders} from '../../apps/api/src/inventory/digitization/execution-results';
import {listPlanPages} from '../../apps/api/src/inventory/digitization/plan-selection';
const origin=process.env.DIGITIZATION_RUNNER_TEST_ORIGIN,requireApi=createRequire(new URL('../../apps/api/package.json',import.meta.url)),{CreateBucketCommand,PutObjectCommand,DeleteObjectCommand}=requireApi('@aws-sdk/client-s3'),sharp=requireApi('sharp');
const actor:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']};
afterAll(()=>pool.end());
it.skipIf(!origin)('HE-G01 ordinary 2:1 photo produces private unconfirmed candidate tiers through current source/lease authority',async()=>{
 const storage=captureStorage(),key=crypto.randomUUID(),bytes=await sharp({create:{width:2048,height:1024,channels:3,background:{r:50,g:100,b:150}}}).png().toBuffer(),workspace=await transaction(actor,c=>createIntake(c,actor)),client=new CpuRunnerClient(origin!,Buffer.from('test-only-private-key-not-a-production-credential-0000'));
 // Synthetic existing panorama scan metadata; actual bytes are rescanned by Clam below.
 const asset=await transaction(actor,async c=>(await c.query("INSERT INTO media_assets(owner_id,object_key,mime,size,rights,visibility,purpose,status,scan_at) VALUES($1,$2,'image/png',$3,'Self-authored CC0 synthetic normal photo; no customer capture','private','panorama','approved',now()) RETURNING id,version",[actor.id,key,bytes.length])).rows[0]);let keys:string[]=[];
 try{
  try{await storage.send(new CreateBucketCommand({Bucket:'haven-private'}));}catch(error:any){if(!['BucketAlreadyExists','BucketAlreadyOwnedByYou'].includes(error.name))throw error;}
  await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key,Body:bytes}));
  const verified=await verifySmallDigitizationSource(actor,workspace.id,asset.id,asset.version,1,'panorama');expect(verified.decoderState).toBe('requires_isolated_image_decoder');const input=await transaction(actor,c=>appendInputRevision(c,actor,workspace.id,1,[verified]));expect(input.processingEligible).toBe(false);
  const stageId=crypto.randomUUID(),runId=crypto.randomUUID(),profile='private-panorama-candidate-v1',fingerprint=await transaction(actor,async c=>cpuSourceFingerprint(workspace.id,actor.orgId!,1,profile,(await c.query('SELECT source_set FROM property_input_revisions WHERE digitization_id=$1 AND revision=1',[workspace.id])).rows[0].source_set[0]));
  await transaction(actor,c=>createRunGraph(c,actor,workspace.id,2,{schemaVersion:1,id:runId,organizationId:actor.orgId!,creatorId:actor.id,target:workspace.target,inputRevision:1,state:'draft',version:1,stages:[{id:stageId,type:'panorama_optimize',state:'pending',dependencies:[],profileId:profile,inputFingerprint:fingerprint,inputRevision:1,attempt:0,fencingToken:null,executionId:null,progress:null}],deadline:new Date(Date.now()+120000).toISOString(),budget:{maxSeconds:30,maxScratchBytes:'67108864'}},['panorama']));await transaction(actor,c=>dispatchRunGraph(c,actor,workspace.id,runId,1));const lease=await transaction(actor,c=>leaseStage(c,actor,workspace.id,stageId,2)),fence=String(lease.fencing_token),request=await transaction(actor,c=>prepareCpuExecution(c,actor,workspace.id,stageId,lease.execution_id,fence,asset.id));
  await expect(startCpuExecution(actor,workspace.id,stageId,lease.execution_id,'999',asset.id,client)).rejects.toMatchObject({status:409});await startCpuExecution(actor,workspace.id,stageId,lease.execution_id,fence,asset.id,client);let state=await client.read(request);const until=Date.now()+20000;while(['pending','running'].includes(state.state)&&Date.now()<until){await new Promise(resolve=>setTimeout(resolve,100));state=await client.read(request);}
  expect(state.state).toBe('succeeded');const receipt=await collectCpuRenders(actor,workspace.id,stageId,lease.execution_id,fence,asset.id,client);expect(receipt.artifactIds).toHaveLength(2);expect(await collectCpuRenders(actor,workspace.id,stageId,lease.execution_id,fence,asset.id,client)).toEqual(receipt);
  const artifacts=await transaction(actor,async c=>(await c.query('SELECT * FROM artifacts WHERE stage_id=$1',[stageId])).rows);keys=artifacts.map(row=>row.object_key);expect(artifacts).toHaveLength(2);expect(artifacts[0]).toMatchObject({status:'private',privacy_status:'pending',quality_report:{kind:'panorama_candidate',projection:'equirectangular_candidate',projectionBasis:'dimensions_only',genuinePanoramaConfirmed:false,sourceWidth:2048,sourceHeight:1024,locationMetadataRetained:false,reviewRequired:true}});expect(artifacts[0].quality_report).not.toHaveProperty('originalToUpright');expect(artifacts[0].quality_report).not.toHaveProperty('page');expect(await transaction(actor,c=>listPlanPages(c,actor,workspace.id))).toEqual([]);
  expect(await transaction(actor,async c=>(await c.query('SELECT state FROM processing_runs WHERE id=$1',[runId])).rows[0].state)).toBe('awaiting_review');const foreign={...actor,id:'00000000-0000-4000-8000-000000000011',orgId:'10000000-0000-4000-8000-000000000005',roles:['agency_manager']};await expect(collectCpuRenders(foreign,workspace.id,stageId,lease.execution_id,fence,asset.id,client)).rejects.toMatchObject({status:403});
 }finally{await storage.send(new DeleteObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key}));for(const objectKey of keys)await storage.send(new DeleteObjectCommand({Bucket:'haven-private',Key:objectKey}));await transaction(actor,c=>c.query("UPDATE media_assets SET status='rejected',version=version+1 WHERE id=$1",[asset.id]));storage.destroy();}
},30000);
