import '../support/env';
import {createRequire} from 'node:module';
import {afterAll,expect,it} from 'vitest';
import type {FastifyRequest} from 'fastify';
import type {Identity} from '../../apps/api/src/platform/core';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {AgencyMembershipsController} from '../../apps/api/src/identity/agency-memberships';
import {AgentCredentialsController} from '../../apps/api/src/services/agent-credentials';
import {PrivacyController} from '../../apps/api/src/identity/privacy';
import {createIntake} from '../../apps/api/src/inventory/digitization/intakes';
import {appendInputRevision} from '../../apps/api/src/inventory/digitization/inputs';
import {captureStorage} from '../../apps/api/src/inventory/digitization/multipart';
import {scanFile} from '../../apps/api/src/inventory/scanner';
import {verifySmallDigitizationSource} from '../../apps/api/src/inventory/digitization/source-validation';
import {cpuSourceFingerprint,prepareCpuExecution} from '../../apps/api/src/inventory/digitization/execution-scope';
import {createRunGraph,dispatchRunGraph} from '../../apps/api/src/inventory/digitization/workflow';
import {leaseStage} from '../../apps/api/src/inventory/digitization/leases';
import {startCpuExecution} from '../../apps/api/src/inventory/digitization/execution-start';
import {collectCpuRenders} from '../../apps/api/src/inventory/digitization/execution-results';
import {CpuRunnerClient} from '../../apps/api/src/inventory/digitization/runner-client';
import {reclaimDeletedAccountProcessing} from '../../apps/api/src/inventory/digitization/deletion-cleanup';
const requireApi=createRequire(new URL('../../apps/api/package.json',import.meta.url)),sharp=requireApi('sharp'),{PutObjectCommand,HeadObjectCommand,ListObjectsV2Command}=requireApi('@aws-sdk/client-s3'),{Pool}=requireApi('pg');
const inspect=new Pool({connectionString:process.env.MIGRATION_DATABASE_URL}),org='10000000-0000-4000-8000-000000000001',admin:Actor={id:'00000000-0000-4000-8000-000000000010',orgId:org,roles:['agency_manager','admin']},identity=(a:Actor)=>({actor:async()=>a} as unknown as Identity),req=(url:string)=>({method:'POST',url,headers:{'idempotency-key':crypto.randomUUID()}} as FastifyRequest);
afterAll(async()=>{await inspect.end();await pool.end();});
it.skipIf(!process.env.DIGITIZATION_RUNNER_TEST_ORIGIN)('account deletion fences active work and confirms real runner/original/derivative purging after agency access is revoked',async()=>{
 const isolatedClient=new CpuRunnerClient(process.env.DIGITIZATION_RUNNER_TEST_ORIGIN!,Buffer.from('test-only-private-key-not-a-production-credential-0000'));
 for(let prior=0;prior<32;prior++){if(!(await reclaimDeletedAccountProcessing(isolatedClient)).reclaimed)break;}
 const id=crypto.randomUUID(),email='engine-delete-'+id+'@example.test',consumer:Actor={id,orgId:null,roles:['consumer']};
 await transaction(admin,c=>c.query("INSERT INTO profiles(id,subject,display_name,email,email_verified) VALUES($1,$2,'Synthetic engine deletion actor',$3,true)",[id,'engine-delete-'+id,email]));
 const invitation=(await new AgencyMembershipsController(identity(admin)).invite(req('/invite'),{version:0,email,role:'agent',reason:'Synthetic engine deletion software test'})).data;
 await new AgencyMembershipsController(identity(consumer)).decision(req('/accept'),invitation.id,{version:1,action:'accept',reason:'Verified fixture accepts scoped engine processing'});
 const actor:Actor={id,orgId:org,roles:['agent']},workspace=await transaction(actor,c=>createIntake(c,actor)),storage=captureStorage(),client=isolatedClient;
 try{
  const content=await sharp({create:{width:256,height:128,channels:3,background:'#516273'}}).png().toBuffer();await scanFile(content);const key=crypto.randomUUID();await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key,Body:content}));
  const asset=await transaction(actor,async c=>(await c.query("INSERT INTO media_assets(owner_id,object_key,mime,size,rights,visibility,purpose,status,scan_at) VALUES($1,$2,'image/png',$3,'Self authored deletion fixture','private','floor_plan','approved',now()) RETURNING id,version",[id,key,content.length])).rows[0]),source=await verifySmallDigitizationSource(actor,workspace.id,asset.id,asset.version,1,'plan');const retainedKey=crypto.randomUUID(),retainedBytes=Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');await scanFile(retainedBytes);await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:'quarantine/'+retainedKey,Body:retainedBytes}));
  const retainedAsset=await transaction(actor,async c=>(await c.query("INSERT INTO media_assets(owner_id,object_key,mime,size,rights,visibility,purpose,status,scan_at) VALUES($1,$2,'application/pdf',$3,'Authored retained credential fixture','private','document','approved',now()) RETURNING id,version",[id,retainedKey,retainedBytes.length])).rows[0]),retainedSource=await verifySmallDigitizationSource(actor,workspace.id,retainedAsset.id,retainedAsset.version,1,'document');
  const credentials=new AgentCredentialsController(identity(actor)),publicProfile=(await credentials.create(req('/agent-profile'),{version:0,city:'bj',name:'Synthetic deletion profile',biography:'Synthetic profile for processing retention software checks.',languages:['English'],districtIds:['10000000-0000-4000-8000-000000000020'],publicEmail:null,contactConsent:false})).data,credential=(await credentials.submit(req('/credential'),publicProfile.id,{version:0,profileVersion:1,holderName:'Synthetic deletion actor',registrationReference:'SYNTHETIC-RETAINED',issuer:'Synthetic credential fixture',expiresOn:'2099-12-31',documentId:retainedAsset.id})).data;
  const credentialBefore=(await inspect.query('SELECT to_jsonb(c) record FROM agent_credentials c WHERE id=$1',[credential.id])).rows[0].record;
  await transaction(actor,c=>appendInputRevision(c,actor,workspace.id,1,[source,retainedSource]));
  const runId=crypto.randomUUID(),profile='upright-image-v1',fingerprint=cpuSourceFingerprint(workspace.id,org,1,profile,{...source,bytes:String(source.bytes)}),stages=[0,1].map(()=>({id:crypto.randomUUID(),type:'document_rasterize' as const,state:'pending' as const,dependencies:[],profileId:profile,inputFingerprint:fingerprint,inputRevision:1,attempt:0,fencingToken:null,executionId:null,progress:null}));
  await transaction(actor,c=>createRunGraph(c,actor,workspace.id,2,{schemaVersion:1,id:runId,organizationId:org,creatorId:id,target:workspace.target,inputRevision:1,state:'draft',version:1,stages,deadline:new Date(Date.now()+120000).toISOString(),budget:{maxSeconds:60,maxScratchBytes:'67108864'}},['plan']));await transaction(actor,c=>dispatchRunGraph(c,actor,workspace.id,runId,1));
  const requests=[];let derivative='';
  for(const [index,stage] of stages.entries()){
   const lease=await transaction(actor,c=>leaseStage(c,actor,workspace.id,stage.id,2)),request=await transaction(actor,c=>prepareCpuExecution(c,actor,workspace.id,stage.id,lease.execution_id,String(lease.fencing_token),asset.id));requests.push(request);await startCpuExecution(actor,workspace.id,stage.id,lease.execution_id,String(lease.fencing_token),asset.id,client);
   if(index===0){const until=Date.now()+15000;while((await client.read(request)).state!=='succeeded'){if(Date.now()>until)throw Error('Deletion fixture real CPU decoder timed out');await new Promise(r=>setTimeout(r,100));}const result=await collectCpuRenders(actor,workspace.id,stage.id,lease.execution_id,String(lease.fencing_token),asset.id,client);derivative=(await transaction(actor,async c=>(await c.query('SELECT object_key FROM artifacts WHERE id=$1',[result.artifactIds[0]])).rows[0].object_key));}
  }
  expect((await storage.send(new HeadObjectCommand({Bucket:'haven-private',Key:derivative}))).ContentLength).toBeGreaterThan(0);
  const outputPrefix=`digitization/${workspace.id}/${runId}/`,authoredOrphanKeys=Array.from({length:1001},(_,index)=>outputPrefix+'authored-uncommitted-'+index+'.json');
  // Actual storage pagination fixture, not a claim of1001 extracted documents.
  for(let offset=0;offset<authoredOrphanKeys.length;offset+=32){const results=await Promise.allSettled(authoredOrphanKeys.slice(offset,offset+32).map(Key=>storage.send(new PutObjectCommand({Bucket:'haven-private',Key,Body:Buffer.from('{"fixture":"authored uncommitted output"}')}))));expect(results.every(result=>result.status==='fulfilled')).toBe(true);}
  expect((await inspect.query('SELECT count(*)::int n FROM artifacts WHERE object_key=ANY($1::text[])',[authoredOrphanKeys])).rows[0].n).toBe(0);

  await expect(transaction(actor,c=>c.query('SELECT digitization_claim_deletion_job()'))).rejects.toMatchObject({code:'42501'});
  expect((await new PrivacyController(identity(actor)).requestDeletion(req('/delete'),{version:1,confirmation:'DELETE MY ACCOUNT',reason:'Delete authored engine test sources and outputs'})).data.accessRevoked).toBe(true);
  await expect(transaction(actor,c=>leaseStage(c,actor,workspace.id,stages[1].id,2))).rejects.toMatchObject({status:403});
  expect((await inspect.query('SELECT state FROM processing_runs WHERE id=$1',[runId])).rows[0].state).toBe('cancel_requested');
  const initial=(await inspect.query('SELECT id,kind,state FROM digitization_deletion_jobs WHERE user_id=$1',[id])).rows;expect(initial.filter((j:any)=>j.kind==='stop_run')).toHaveLength(1);expect(initial.filter((j:any)=>j.kind==='object')).toHaveLength(4);expect(initial.filter((j:any)=>j.kind==='run_outputs')).toHaveLength(1);expect(initial.filter((j:any)=>j.state==='retained')).toHaveLength(1);expect(initial.filter((j:any)=>j.state==='pending')).toHaveLength(5);
  expect(await reclaimDeletedAccountProcessing(client)).toEqual({reclaimed:1});expect((await inspect.query("SELECT state FROM digitization_deletion_jobs WHERE user_id=$1 AND kind='stop_run'",[id])).rows[0].state).toBe('pending');expect((await storage.send(new HeadObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key}))).ContentLength).toBe(content.length);
  for(let n=0;n<32;n++){if(!(await reclaimDeletedAccountProcessing(client)).reclaimed)break;}
  expect((await inspect.query('SELECT state FROM digitization_deletion_jobs WHERE user_id=$1',[id])).rows.every((j:any)=>j.state==='complete'||j.state==='retained')).toBe(true);expect((await inspect.query('SELECT state FROM processing_runs WHERE id=$1',[runId])).rows[0].state).toBe('cancelled');
  for(const request of requests)expect(await client.read(request)).toMatchObject({state:'cancelled',processStopped:true,result:null});
  const deletedKeys=(await inspect.query("SELECT object_key FROM digitization_deletion_jobs WHERE user_id=$1 AND kind='object' AND state='complete'",[id])).rows.map((j:any)=>j.object_key);expect(deletedKeys).toContain('quarantine/'+key);expect(deletedKeys).toContain(derivative);for(const objectKey of deletedKeys)await expect(storage.send(new HeadObjectCommand({Bucket:'haven-private',Key:objectKey}))).rejects.toMatchObject({$metadata:{httpStatusCode:404}});
  expect((await storage.send(new ListObjectsV2Command({Bucket:'haven-private',Prefix:outputPrefix,MaxKeys:1})) as {Contents?:unknown[]}).Contents??[]).toEqual([]);
  for(const key of [authoredOrphanKeys[0],authoredOrphanKeys.at(-1)!])await expect(storage.send(new HeadObjectCommand({Bucket:'haven-private',Key:key}))).rejects.toMatchObject({$metadata:{httpStatusCode:404}});
  expect((await storage.send(new HeadObjectCommand({Bucket:'haven-private',Key:'quarantine/'+retainedKey}))).ContentLength).toBe(retainedBytes.length);expect((await inspect.query('SELECT to_jsonb(c) record FROM agent_credentials c WHERE id=$1',[credential.id])).rows[0].record).toEqual(credentialBefore);expect((await inspect.query("SELECT metadata->>'retentionReason' reason FROM digitization_deletion_jobs WHERE user_id=$1 AND state='retained'",[id])).rows).toEqual([{reason:'non_engine_reference_requires_owning_review'}]);
  expect(await reclaimDeletedAccountProcessing(client)).toEqual({reclaimed:0});expect((await transaction(admin,async c=>(await c.query('SELECT digitization_finish_deletion_job($1,$2) done',[initial[0].id,'999'])).rows[0].done))).toBe(false);
  await transaction({...admin,id:'00000000-0000-4000-8000-000000000003',roles:['agent']},async c=>{expect((await c.query('SELECT id FROM digitization_deletion_jobs WHERE user_id=$1',[id])).rowCount).toBe(0);});
 }finally{storage.destroy();}
},60000);
