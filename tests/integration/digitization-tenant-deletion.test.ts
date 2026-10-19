import '../support/env';
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import {afterAll,expect,it} from 'vitest';
import type {FastifyRequest} from 'fastify';
import type {Identity} from '../../apps/api/src/platform/core';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {AgencyMembershipsController} from '../../apps/api/src/identity/agency-memberships';
import {AgentCredentialsController} from '../../apps/api/src/services/agent-credentials';
import {DigitizationTenantDeletionController} from '../../apps/api/src/inventory/digitization/tenant-deletion-controller';
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
const requireApi=createRequire(new URL('../../apps/api/package.json',import.meta.url)),sharp=requireApi('sharp'),{PutObjectCommand,HeadObjectCommand}=requireApi('@aws-sdk/client-s3'),{Pool}=requireApi('pg');
const inspect=new Pool({connectionString:process.env.MIGRATION_DATABASE_URL}),org=crypto.randomUUID(),admin:Actor={id:'00000000-0000-4000-8000-000000000010',orgId:org,roles:['agency_manager','admin']},identity=(a:Actor)=>({actor:async()=>a} as unknown as Identity),req=(url:string)=>({method:'POST',url,headers:{'idempotency-key':crypto.randomUUID()}} as FastifyRequest);
afterAll(async()=>{await inspect.end();await pool.end();});
it.skipIf(!process.env.DIGITIZATION_RUNNER_TEST_ORIGIN||process.env.HAVEN_CONTAINER_TESTS!=='true'||process.env.HAVEN_ENV_FILE!=='.env.integration')('tenant erasure fences active CPU work and removes originals and derivatives while retaining credential, account and organization history',async()=>{
 const isolatedClient=new CpuRunnerClient(process.env.DIGITIZATION_RUNNER_TEST_ORIGIN!,Buffer.from('test-only-private-key-not-a-production-credential-0000'));
 for(let prior=0;prior<32;prior++){if(!(await reclaimDeletedAccountProcessing(isolatedClient)).reclaimed)break;}
 await inspect.query("INSERT INTO organizations(id,name,type) VALUES($1,'Synthetic tenant deletion fixture','agency')",[org]);
 const managerId=crypto.randomUUID(),manager:Actor={id:managerId,orgId:org,roles:['agency_manager']};
 await inspect.query("INSERT INTO profiles(id,subject,display_name,email,email_verified) VALUES($1,$2,'Synthetic deletion fixture manager',$3,true)",[managerId,'tenant-manager-'+managerId,'tenant-manager-'+managerId+'@example.test']);
 await inspect.query("INSERT INTO memberships(user_id,organization_id,role,status) VALUES($1,$2,'agency_manager','active')",[managerId,org]);
 const id=crypto.randomUUID(),email='engine-delete-'+id+'@example.test',consumer:Actor={id,orgId:null,roles:['consumer']};
 await transaction(admin,c=>c.query("INSERT INTO profiles(id,subject,display_name,email,email_verified) VALUES($1,$2,'Synthetic engine deletion actor',$3,true)",[id,'engine-delete-'+id,email]));
 const invitation=(await new AgencyMembershipsController(identity(manager)).invite(req('/invite'),{version:0,email,role:'agent',reason:'Synthetic engine deletion software test'})).data;
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
  await expect(transaction(actor,c=>c.query('SELECT digitization_claim_deletion_job()'))).rejects.toMatchObject({code:'42501'});
  const controller=new DigitizationTenantDeletionController(identity(admin)),context=(await controller.context(req('/context'),org)).data;
  await expect(new DigitizationTenantDeletionController(identity(actor)).context(req('/context'),org)).rejects.toMatchObject({code:'42501'});
  const payload={scopeVersion:context.scopeVersion,deletionConfirmed:true as const,reason:'Delete scoped synthetic tenant engine files only'},command=req('/tenant-delete');
  await expect(controller.request(req('/stale'),org,{...payload,scopeVersion:'0'.repeat(64)})).rejects.toMatchObject({code:'40001'});
  const receipt=(await controller.request(command,org,payload)).data;expect(receipt).toMatchObject({accessRevoked:true,onlineCleanupComplete:false,retainedBusinessRecords:true});
  expect((await controller.request(command,org,payload)).data).toEqual(receipt);
  await expect(controller.request(req('/duplicate'),org,payload)).rejects.toMatchObject({code:'40001'});
  await expect(transaction(actor,c=>createIntake(c,actor))).rejects.toBeDefined();
  expect((await inspect.query('SELECT state FROM profiles WHERE id=$1',[id])).rows[0].state).toBe('active');
  expect((await inspect.query('SELECT name FROM organizations WHERE id=$1',[org])).rows[0].name).toBe('Synthetic tenant deletion fixture');

  await expect(transaction(actor,c=>leaseStage(c,actor,workspace.id,stages[1].id,2))).rejects.toMatchObject({status:404});
  expect((await inspect.query('SELECT state FROM processing_runs WHERE id=$1',[runId])).rows[0].state).toBe('cancel_requested');
  const initial=(await inspect.query('SELECT id,kind,state FROM digitization_deletion_jobs WHERE tenant_deletion_id=$1',[receipt.id])).rows;expect(initial.filter((j:any)=>j.kind==='stop_run')).toHaveLength(1);expect(initial.filter((j:any)=>j.kind==='object')).toHaveLength(4);expect(initial.filter((j:any)=>j.kind==='run_outputs')).toHaveLength(1);expect(initial.filter((j:any)=>j.state==='retained')).toHaveLength(1);expect(initial.filter((j:any)=>j.state==='pending')).toHaveLength(5);
  expect(await reclaimDeletedAccountProcessing(client)).toEqual({reclaimed:1});expect((await inspect.query("SELECT state FROM digitization_deletion_jobs WHERE tenant_deletion_id=$1 AND kind='stop_run'",[receipt.id])).rows[0].state).toBe('pending');expect((await storage.send(new HeadObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key}))).ContentLength).toBe(content.length);
  for(let n=0;n<6;n++)await reclaimDeletedAccountProcessing(client);
  expect((await inspect.query('SELECT state FROM digitization_deletion_jobs WHERE tenant_deletion_id=$1',[receipt.id])).rows.every((j:any)=>j.state==='complete'||j.state==='retained')).toBe(true);expect((await inspect.query('SELECT state FROM processing_runs WHERE id=$1',[runId])).rows[0].state).toBe('cancelled');
  for(const request of requests){expect(await client.read(request)).toMatchObject({state:'cancelled',processStopped:true,result:null});expect(await client.submit(request,content)).toMatchObject({state:'cancelled',processStopped:true,result:null});}
  const deletedKeys=(await inspect.query("SELECT object_key FROM digitization_deletion_jobs WHERE tenant_deletion_id=$1 AND kind='object' AND state='complete'",[receipt.id])).rows.map((j:any)=>j.object_key);expect(deletedKeys).toContain('quarantine/'+key);expect(deletedKeys).toContain(derivative);for(const objectKey of deletedKeys)await expect(storage.send(new HeadObjectCommand({Bucket:'haven-private',Key:objectKey}))).rejects.toMatchObject({$metadata:{httpStatusCode:404}});
  expect((await storage.send(new HeadObjectCommand({Bucket:'haven-private',Key:'quarantine/'+retainedKey}))).ContentLength).toBe(retainedBytes.length);expect((await inspect.query('SELECT to_jsonb(c) record FROM agent_credentials c WHERE id=$1',[credential.id])).rows[0].record).toEqual(credentialBefore);expect((await inspect.query("SELECT metadata->>'retentionReason' reason FROM digitization_deletion_jobs WHERE tenant_deletion_id=$1 AND state='retained'",[receipt.id])).rows).toEqual([{reason:'owning_module_or_other_tenant_reference'}]);
  expect((await controller.context(req('/completed'),org)).data.request).toMatchObject({pendingJobs:0,retainedOriginals:1});
  expect(await reclaimDeletedAccountProcessing(client)).toEqual({reclaimed:0});expect((await transaction(admin,async c=>(await c.query('SELECT digitization_finish_deletion_job($1,$2) done',[initial[0].id,'999'])).rows[0].done))).toBe(false);
  await transaction({...admin,id:'00000000-0000-4000-8000-000000000003',roles:['agent']},async c=>{expect((await c.query('SELECT id FROM digitization_deletion_jobs WHERE tenant_deletion_id=$1',[receipt.id])).rowCount).toBe(0);});
  const browserFixtures=[];for(const project of ['desktop','mobile']){const tenant=crypto.randomUUID();await inspect.query("INSERT INTO organizations(id,name,type) VALUES($1,$2,'agency')",[tenant,'Synthetic browser engine deletion '+project+' '+tenant]);await inspect.query("INSERT INTO memberships(user_id,organization_id,role,status) VALUES($1,$2,'agent','active')",[id,tenant]);const member={...actor,orgId:tenant};const draft=await transaction(member,c=>createIntake(c,member));browserFixtures.push({project,organizationId:tenant,engineId:draft.id});}writeFileSync('infra/generated/integration/tenant-deletion-browser.json',JSON.stringify(browserFixtures)+'\n');
 }finally{storage.destroy();}
},30000);
it.skipIf(!process.env.DIGITIZATION_RUNNER_TEST_ORIGIN||process.env.HAVEN_CONTAINER_TESTS!=='true'||process.env.HAVEN_ENV_FILE!=='.env.integration')('a tenant tombstone retains an original still bound to another live tenant and never inherits that tenant access',async()=>{
 const root:Actor={id:admin.id,orgId:null,roles:['admin']},tenantA=crypto.randomUUID(),tenantB=crypto.randomUUID(),owner=crypto.randomUUID();
 await inspect.query("INSERT INTO profiles(id,subject,display_name,email,email_verified) VALUES($1,$2,'Synthetic scoped tenant source actor',$3,true)",[owner,'tenant-source-'+owner,'tenant-source-'+owner+'@example.test']);
 for(const tenant of [tenantA,tenantB]){await inspect.query("INSERT INTO organizations(id,name,type) VALUES($1,'Synthetic shared-source tenant','agency')",[tenant]);await inspect.query("INSERT INTO memberships(user_id,organization_id,role,status) VALUES($1,$2,'agent','active')",[owner,tenant]);}
 const a:Actor={id:owner,orgId:tenantA,roles:['agent']},b:Actor={id:owner,orgId:tenantB,roles:['agent']},wa=await transaction(a,c=>createIntake(c,a)),wb=await transaction(b,c=>createIntake(c,b)),storage=captureStorage(),key=crypto.randomUUID(),content=await sharp({create:{width:128,height:128,channels:3,background:'#445566'}}).png().toBuffer();
 try{
  await scanFile(content);await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key,Body:content}));
  const asset=await transaction(a,async c=>(await c.query("INSERT INTO media_assets(owner_id,object_key,mime,size,rights,visibility,purpose,status,scan_at) VALUES($1,$2,'image/png',$3,'Authored shared-tenant fixture','private','floor_plan','approved',now()) RETURNING id,version",[owner,key,content.length])).rows[0]);
  for(const [actor,workspace] of [[a,wa],[b,wb]] as const){const source=await verifySmallDigitizationSource(actor,workspace.id,asset.id,asset.version,1,'plan');await transaction(actor,c=>appendInputRevision(c,actor,workspace.id,1,[source]));}
  const controller=new DigitizationTenantDeletionController(identity(root)),scope=(await controller.context(req('/shared-context'),tenantA)).data,receipt=(await controller.request(req('/shared-delete'),tenantA,{scopeVersion:scope.scopeVersion,deletionConfirmed:true,reason:'Erase only the first synthetic tenant engine scope'})).data;
  expect((await controller.context(req('/shared-after'),tenantA)).data.request).toMatchObject({pendingJobs:0,retainedOriginals:1});
  expect((await storage.send(new HeadObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key}))).ContentLength).toBe(content.length);
  await expect(verifySmallDigitizationSource(a,wa.id,asset.id,asset.version,1,'plan')).rejects.toBeDefined();
  expect(await verifySmallDigitizationSource(b,wb.id,asset.id,asset.version,1,'plan')).toMatchObject({assetId:asset.id});
  expect((await inspect.query('SELECT status,version FROM media_assets WHERE id=$1',[asset.id])).rows[0]).toEqual({status:'approved',version:asset.version});
  expect((await inspect.query('SELECT action FROM audit_events WHERE resource_id=$1',[receipt.id])).rows).toEqual([{action:'digitization.tenant_deletion_requested'}]);
  const other=(await controller.context(req('/other-context'),tenantB)).data;await controller.request(req('/other-delete'),tenantB,{scopeVersion:other.scopeVersion,deletionConfirmed:true,reason:'Erase the second synthetic tenant after shared retention proof'});
  expect(await reclaimDeletedAccountProcessing()).toEqual({reclaimed:1});await expect(storage.send(new HeadObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key}))).rejects.toMatchObject({$metadata:{httpStatusCode:404}});
 }finally{storage.destroy();}
},30000);
it.skipIf(!process.env.DIGITIZATION_RUNNER_TEST_ORIGIN||process.env.HAVEN_CONTAINER_TESTS!=='true'||process.env.HAVEN_ENV_FILE!=='.env.integration')('a concurrent foreign-tenant binding cannot commit after erasure acquires the source lock',async()=>{
 const root:Actor={id:admin.id,orgId:null,roles:['admin']},tenantA=crypto.randomUUID(),tenantB=crypto.randomUUID(),owner=crypto.randomUUID(),storage=captureStorage(),key=crypto.randomUUID(),content=await sharp({create:{width:128,height:128,channels:3,background:'#334455'}}).png().toBuffer();
 await inspect.query("INSERT INTO profiles(id,subject,display_name,email,email_verified) VALUES($1,$2,'Synthetic scoped tenant source actor',$3,true)",[owner,'tenant-source-'+owner,'tenant-source-'+owner+'@example.test']);
 for(const tenant of [tenantA,tenantB]){await inspect.query("INSERT INTO organizations(id,name,type) VALUES($1,'Synthetic binding race tenant','agency')",[tenant]);await inspect.query("INSERT INTO memberships(user_id,organization_id,role,status) VALUES($1,$2,'agent','active')",[owner,tenant]);}
 const a:Actor={id:owner,orgId:tenantA,roles:['agent']},b:Actor={id:owner,orgId:tenantB,roles:['agent']},wa=await transaction(a,c=>createIntake(c,a)),wb=await transaction(b,c=>createIntake(c,b));let holder:any;
 try{
  await scanFile(content);await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key,Body:content}));const asset=await transaction(a,async c=>(await c.query("INSERT INTO media_assets(owner_id,object_key,mime,size,rights,visibility,purpose,status,scan_at) VALUES($1,$2,'image/png',$3,'Authored binding race fixture','private','floor_plan','approved',now()) RETURNING id,version",[owner,key,content.length])).rows[0]);
  const sa=await verifySmallDigitizationSource(a,wa.id,asset.id,asset.version,1,'plan'),sb=await verifySmallDigitizationSource(b,wb.id,asset.id,asset.version,1,'plan');await transaction(a,c=>appendInputRevision(c,a,wa.id,1,[sa]));
  const controller=new DigitizationTenantDeletionController(identity(root)),scope=(await controller.context(req('/race-context'),tenantA)).data;
  holder=await inspect.connect();await holder.query('BEGIN');await holder.query('SELECT id FROM media_assets WHERE id=$1 FOR UPDATE',[asset.id]);
  const holderPid=(await holder.query('SELECT pg_backend_pid() pid')).rows[0].pid;
  const waitFor=async(minimum:number)=>{const until=Date.now()+5000;for(;;){const waiting=(await inspect.query('WITH RECURSIVE waiting(pid) AS (SELECT $1::integer UNION SELECT a.pid FROM pg_stat_activity a JOIN waiting w ON w.pid=ANY(pg_blocking_pids(a.pid))) SELECT count(*)::int-1 n FROM waiting',[holderPid])).rows[0].n;if(waiting>=minimum)return;if(Date.now()>until)throw Error('Expected scoped source lock wait was not observed');await new Promise(resolve=>setTimeout(resolve,25));}};
  const deletion=controller.request(req('/race-delete'),tenantA,{scopeVersion:scope.scopeVersion,deletionConfirmed:true,reason:'Erase the first tenant while a new binding waits on its source'});await waitFor(1);
  // Attach rejection handling immediately: this write must roll back entirely.
  const binding=transaction(b,c=>appendInputRevision(c,b,wb.id,1,[sb])).then(()=>({error:null}),error=>({error}));await waitFor(2);
  await holder.query('COMMIT');holder.release();holder=null;expect((await deletion).data.accessRevoked).toBe(true);expect((await binding).error).toMatchObject({status:403,response:{code:'SOURCE_ACCESS_CHANGED'}});
  expect((await inspect.query('SELECT current_input_revision FROM property_digitizations WHERE id=$1',[wb.id])).rows[0].current_input_revision).toBe(0);expect((await inspect.query('SELECT id FROM digitization_asset_bindings WHERE digitization_id=$1',[wb.id])).rowCount).toBe(0);
  expect((await controller.context(req('/race-after'),tenantA)).data.request).toMatchObject({pendingJobs:1,retainedOriginals:0});expect(await reclaimDeletedAccountProcessing()).toEqual({reclaimed:1});await expect(storage.send(new HeadObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key}))).rejects.toMatchObject({$metadata:{httpStatusCode:404}});
 }finally{if(holder){await holder.query('ROLLBACK');holder.release();}storage.destroy();}
},30000);
