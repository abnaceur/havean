import '../support/env';
import {afterAll,expect,it} from 'vitest';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {existsSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import type {FastifyRequest} from 'fastify';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import frames from '../../services/property-processing/tests/fixtures/media-frames-synthetic.json';
import {reserveCapturedSource} from '../../apps/api/src/inventory/digitization/capture-source';
import {DigitizationTenantDeletionController} from '../../apps/api/src/inventory/digitization/tenant-deletion-controller';
import {reclaimDeletedAccountProcessing} from '../../apps/api/src/inventory/digitization/deletion-cleanup';
import {createIntake} from '../../apps/api/src/inventory/digitization/intakes';
import {DigitizationCaptureController} from '../../apps/api/src/inventory/digitization/capture-controller';
import type {Identity} from '../../apps/api/src/platform/core';
import {captureStorage} from '../../apps/api/src/inventory/digitization/multipart';
import {verifySmallDigitizationSource} from '../../apps/api/src/inventory/digitization/source-validation';
import {appendInputRevision} from '../../apps/api/src/inventory/digitization/inputs';
import {startPrivateSourceProcessing} from '../../apps/api/src/inventory/digitization/processing';
import {prepareCpuExecution} from '../../apps/api/src/inventory/digitization/execution-scope';
import {leaseStage} from '../../apps/api/src/inventory/digitization/leases';
import {startCpuExecution} from '../../apps/api/src/inventory/digitization/execution-start';
import {CpuRunnerClient} from '../../apps/api/src/inventory/digitization/runner-client';
import {collectCpuRenders} from '../../apps/api/src/inventory/digitization/execution-results';
const inspect=new (createRequire(new URL('../../apps/api/package.json',import.meta.url))('pg').Pool)({connectionString:process.env.MIGRATION_DATABASE_URL});
const origin=process.env.DIGITIZATION_RUNNER_TEST_ORIGIN,{UploadPartCommand,PutObjectCommand,HeadObjectCommand}=createRequire(new URL('../../apps/api/package.json',import.meta.url))('@aws-sdk/client-s3');
const actor:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']};
const foreign:Actor={id:'00000000-0000-4000-8000-000000000011',orgId:'10000000-0000-4000-8000-000000000005',roles:['agency_manager']};
const controller=(a=actor)=>new DigitizationCaptureController({actor:async()=>a} as unknown as Identity),request=(key=crypto.randomUUID())=>({method:'POST',url:'/capture/source',headers:{'idempotency-key':key}} as unknown as FastifyRequest);
afterAll(async()=>{await inspect.end();await pool.end();});
async function uploaded(body:Buffer,a=actor){
 const workspace=await transaction(a,c=>createIntake(c,a)),api=controller(a),capture=(await api.createIntake(request(),workspace.id,{digitizationVersion:workspace.version,mime:'video/mp4',bytes:body.length,rights:'Self-authored CC0 repository clip; no customer capture or performance claim',authorityConfirmed:true})).data;
 const row=await transaction(a,async c=>(await c.query('SELECT object_key,upload_id FROM digitization_capture_uploads WHERE id=$1',[capture.id])).rows[0]),storage=captureStorage();try{for(let offset=0,n=1;offset<body.length;offset+=capture.partBytes,n++)await storage.send(new UploadPartCommand({Bucket:'haven-private',Key:row.object_key,UploadId:row.upload_id,PartNumber:n,Body:body.subarray(offset,offset+capture.partBytes)}));}finally{storage.destroy();}
 await api.completeIntake(request(),workspace.id,capture.id,{version:capture.version,checksum:createHash('sha256').update(body).digest('hex')});
 const completed=(await api.readIntake(request(),workspace.id,capture.id)).data;return {workspace,api,capture:completed,rawKey:row.object_key,body:{workspaceVersion:workspace.version,captureVersion:completed.version}};
}
it.skipIf(!origin)('real multipart capture is scanned once, privately bound and decoded into source-linked review-pending frames',async()=>{
 const bytes=Buffer.from(frames.file.base64,'base64'),f=await uploaded(bytes),key=crypto.randomUUID();
 expect((await f.api.source(request(),f.workspace.id,f.capture.id)).data).toBeNull();
 await expect(controller(foreign).admitSource(request(),f.workspace.id,f.capture.id,f.body)).rejects.toMatchObject({status:404});
 await expect(f.api.admitSource(request(),f.workspace.id,f.capture.id,{...f.body,captureVersion:f.capture.version+1})).rejects.toMatchObject({status:409});
 await expect(f.api.admitSource(request(),f.workspace.id,f.capture.id,{...f.body,workspaceVersion:f.workspace.version+1})).rejects.toMatchObject({status:409});
 const source=(await f.api.admitSource(request(key),f.workspace.id,f.capture.id,f.body)).data;
 expect(source).toMatchObject({state:'admitted',decoderState:'requires_isolated_media_decoder',publiclyServed:false,bytes:String(bytes.length)});expect(JSON.stringify(source)).not.toMatch(/object_key|quarantine\/|capture_source_lease|checksum/);
 expect((await f.api.admitSource(request(key),f.workspace.id,f.capture.id,f.body)).data).toEqual(source);
 expect(await transaction(actor,async c=>(await c.query("SELECT count(*)::int n FROM outbox WHERE aggregate_id=$1 AND kind='digitization.capture_source_admitted'",[f.workspace.id])).rows[0].n)).toBe(1);
 const other=await transaction(actor,c=>createIntake(c,actor));await expect(verifySmallDigitizationSource(actor,other.id,source.assetId,source.assetVersion,1,'video')).rejects.toMatchObject({status:403,response:{code:'CAPTURE_SOURCE_SCOPE_CHANGED'}});
 const verified=await verifySmallDigitizationSource(actor,f.workspace.id,source.assetId,source.assetVersion,1,'video'),input=await transaction(actor,c=>appendInputRevision(c,actor,f.workspace.id,f.workspace.version,[verified]));expect(input.processingEligible).toBe(false);
 const run=await transaction(actor,c=>startPrivateSourceProcessing(c,actor,f.workspace.id,{version:input.version,inputRevision:1,assetId:source.assetId,output:'frames',locale:'en'}));
 const stage=run.stageIds[0],lease=await transaction(actor,c=>leaseStage(c,actor,f.workspace.id,stage,2)),fence=String(lease.fencing_token),client=new CpuRunnerClient(origin!,Buffer.from('test-only-private-key-not-a-production-credential-0000')),command=await transaction(actor,c=>prepareCpuExecution(c,actor,f.workspace.id,stage,lease.execution_id,fence,source.assetId));
 await startCpuExecution(actor,f.workspace.id,stage,lease.execution_id,fence,source.assetId,client);let state=await client.read(command);const until=Date.now()+20000;while(['pending','running'].includes(state.state)&&Date.now()<until){await new Promise(resolve=>setTimeout(resolve,100));state=await client.read(command);}expect(state.state).toBe('succeeded');
 const receipt=await collectCpuRenders(actor,f.workspace.id,stage,lease.execution_id,fence,source.assetId,client);expect(receipt.artifactIds).toHaveLength(3);
 const artifacts=await transaction(actor,async c=>(await c.query('SELECT status,privacy_status,quality_report FROM artifacts WHERE stage_id=$1',[stage])).rows);expect(artifacts).toHaveLength(3);for(const row of artifacts)expect(row).toMatchObject({status:'private',privacy_status:'pending',quality_report:{kind:'video_frame',reviewRequired:true,locationMetadataRetained:false}});
},60000);
it('capture checksum mismatch leaves a durable private reservation and replay cannot falsely admit its copied source',async()=>{
 const bytes=Buffer.from(frames.file.base64,'base64'),f=await uploaded(bytes),changed=Buffer.from(bytes);changed[changed.length-1]^=1;const storage=captureStorage();try{
 await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:f.rawKey,Body:changed,ContentType:'video/mp4'}));await expect(f.api.admitSource(request(),f.workspace.id,f.capture.id,f.body)).rejects.toMatchObject({status:422,response:{code:'CAPTURE_OBJECT_MISMATCH'}});
 const current=(await f.api.source(request(),f.workspace.id,f.capture.id)).data;expect(current).toMatchObject({state:'quarantined',publiclyServed:false});
 const replay=(await f.api.admitSource(request(),f.workspace.id,f.capture.id,f.body)).data;expect(replay).toEqual(current);expect(await transaction(actor,async c=>(await c.query("SELECT count(*)::int n FROM outbox WHERE aggregate_id=$1 AND kind='digitization.capture_source_admitted'",[f.workspace.id])).rows[0].n)).toBe(0);
 }finally{await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:f.rawKey,Body:bytes,ContentType:'video/mp4'}));storage.destroy();}
},30000);
function freeAtom(payload:Buffer){const head=Buffer.alloc(8);head.writeUInt32BE(payload.length+8);head.write('free',4);return Buffer.concat([head,payload]);}
it('completed multipart originals above the registered profile remain quarantined without a copied media reservation',async()=>{
 const bytes=Buffer.concat([Buffer.from(frames.file.base64,'base64'),freeAtom(Buffer.alloc(10*1024*1024))]),f=await uploaded(bytes);
 await expect(f.api.admitSource(request(),f.workspace.id,f.capture.id,f.body)).rejects.toMatchObject({status:413,response:{code:'CAPTURE_SOURCE_PROFILE_TOO_LARGE'}});
 expect(await transaction(actor,async c=>(await c.query('SELECT count(*)::int n FROM media_assets WHERE digitization_capture_id=$1',[f.capture.id])).rows[0].n)).toBe(0);
},30000);
it('the native scanner rejects the standard antivirus test file used by source admission',async()=>{
 const {scanFile}=await import('../../apps/api/src/inventory/scanner');
 const eicar=Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
 await expect(scanFile(eicar)).rejects.toMatchObject({status:400,response:{code:'UNSAFE_FILE'}});
},30000);
async function tenantCapture(){const org=crypto.randomUUID(),id=crypto.randomUUID();await inspect.query("INSERT INTO organizations(id,name,type) VALUES($1,'Synthetic unbound capture cleanup tenant','agency')",[org]);await inspect.query("INSERT INTO profiles(id,subject,display_name,email,email_verified) VALUES($1,$2,'Synthetic capture cleanup manager',$3,true)",[id,'capture-cleanup-'+id,'capture-cleanup-'+id+'@example.test']);await inspect.query("INSERT INTO memberships(user_id,organization_id,role,status) VALUES($1,$2,'agency_manager','active')",[id,org]);const a:Actor={id,orgId:org,roles:['agency_manager']};return {...await uploaded(Buffer.from(frames.file.base64,'base64'),a),a,org};}
async function eraseTenant(org:string){const admin:Actor={id:'00000000-0000-4000-8000-000000000010',orgId:null,roles:['admin']},api=new DigitizationTenantDeletionController({actor:async()=>admin} as unknown as Identity),context=(await api.context(request(),org)).data;expect(context.sourceCount).toBe(1);await api.request(request(),org,{scopeVersion:context.scopeVersion,deletionConfirmed:true,reason:'Verified synthetic unbound capture cleanup acceptance'});return {api};}
it('tenant deletion counts and physically removes an admitted capture original before any input binding while preserving business identities',async()=>{
 const f=await tenantCapture(),source=(await f.api.admitSource(request(),f.workspace.id,f.capture.id,f.body)).data,key=(await inspect.query('SELECT object_key FROM media_assets WHERE id=$1',[source.assetId])).rows[0].object_key;expect(await inspect.query('SELECT 1 FROM digitization_asset_bindings WHERE asset_id=$1',[source.assetId]).then((r:any)=>r.rowCount)).toBe(0);
 const root=await eraseTenant(f.org);for(let n=0;n<64;n++){if(!(await reclaimDeletedAccountProcessing()).reclaimed)break;}
 const storage=captureStorage();try{for(const objectKey of [f.rawKey,'quarantine/'+key])await expect(storage.send(new HeadObjectCommand({Bucket:'haven-private',Key:objectKey}))).rejects.toMatchObject({$metadata:{httpStatusCode:404}});}finally{storage.destroy();}
 expect((await root.api.context(request(),f.org)).data.request).toMatchObject({pendingJobs:0,retainedOriginals:0});expect((await inspect.query('SELECT state FROM profiles WHERE id=$1',[f.a.id])).rows[0].state).toBe('active');expect((await inspect.query('SELECT 1 FROM organizations WHERE id=$1',[f.org])).rowCount).toBe(1);await expect(f.api.source(request(),f.workspace.id,f.capture.id)).rejects.toMatchObject({status:404});
},30000);
it('an actual copier SIGKILL retains an unbound copy through its real five-minute lease, then removes it and refuses late admission',async()=>{
 const f=await tenantCapture(),reservation=await transaction(f.a,c=>reserveCapturedSource(c,f.a,f.workspace.id,f.capture.id,f.body)),row=(await inspect.query('SELECT object_key,capture_copy_until FROM media_assets WHERE id=$1',[reservation.assetId])).rows[0],storage=captureStorage();
 expect(await transaction(f.a,c=>reserveCapturedSource(c,f.a,f.workspace.id,f.capture.id,f.body))).toEqual({assetId:reservation.assetId,leaseId:null});
 await expect(transaction(f.a,c=>c.query("UPDATE media_assets SET capture_source_lease=$2,capture_copy_until=now()+interval '5 minutes',version=version+1 WHERE id=$1",[reservation.assetId,crypto.randomUUID()]))).rejects.toMatchObject({code:'40001'});
 const folder=mkdtempSync(path.join(tmpdir(),'haven-capture-copier-')),payloadFile=path.join(folder,'scope.json'),markerFile=path.join(folder,'copied.json');
 writeFileSync(payloadFile,JSON.stringify({actor:f.a,engine:f.workspace.id,capture:f.capture.id,body:f.body,reservation,copiedKey:'quarantine/'+row.object_key}),{mode:0o600});
 const child=spawn(process.execPath,[path.resolve('node_modules/tsx/dist/cli.mjs'),'tests/support/digitization-capture-copier-fixture.ts',payloadFile,markerFile],{detached:true,stdio:'ignore',env:{...process.env,TSX_TSCONFIG_PATH:'apps/api/tsconfig.json'}});
 const exited=new Promise<{code:number|null;signal:NodeJS.Signals|null}>(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
 try{
  const boundaryDeadline=Date.now()+30000;while(!existsSync(markerFile)&&child.exitCode===null&&child.signalCode===null&&Date.now()<boundaryDeadline)await new Promise(resolve=>setTimeout(resolve,100));
  expect(existsSync(markerFile)).toBe(true);expect(JSON.parse(readFileSync(markerFile,'utf8'))).toEqual({actualConditionalCopyCompleted:true});expect(child.exitCode).toBeNull();expect(child.signalCode).toBeNull();
  expect((await storage.send(new HeadObjectCommand({Bucket:'haven-private',Key:'quarantine/'+row.object_key})) as {ContentLength:number}).ContentLength).toBe(Buffer.from(frames.file.base64,'base64').length);
  process.kill(-child.pid!,'SIGKILL');expect(await exited).toEqual({code:null,signal:'SIGKILL'});
  expect((await inspect.query('SELECT status,scan_at,capture_source_lease FROM media_assets WHERE id=$1',[reservation.assetId])).rows[0]).toMatchObject({status:'quarantined',scan_at:null,capture_source_lease:reservation.leaseId});
  expect((await inspect.query("SELECT count(*)::int n FROM outbox WHERE aggregate_id=$1 AND kind='digitization.capture_source_admitted'",[f.workspace.id])).rows[0].n).toBe(0);
  const root=await eraseTenant(f.org);
  for(let n=0;n<64;n++){if(!(await reclaimDeletedAccountProcessing()).reclaimed)break;}
  expect((await root.api.context(request(),f.org)).data.request).toMatchObject({pendingJobs:1});expect((await storage.send(new HeadObjectCommand({Bucket:'haven-private',Key:'quarantine/'+row.object_key})) as {ContentLength:number}).ContentLength).toBeGreaterThan(0);await expect(f.api.admitSource(request(),f.workspace.id,f.capture.id,f.body)).rejects.toMatchObject({status:404});
  const deadline=new Date(row.capture_copy_until).getTime()+1000;while(Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,Math.min(1000,deadline-Date.now())));
  for(let n=0;n<64;n++){if(!(await reclaimDeletedAccountProcessing()).reclaimed)break;}
  for(const key of [f.rawKey,'quarantine/'+row.object_key])await expect(storage.send(new HeadObjectCommand({Bucket:'haven-private',Key:key}))).rejects.toMatchObject({$metadata:{httpStatusCode:404}});expect((await root.api.context(request(),f.org)).data.request).toMatchObject({pendingJobs:0});
 }finally{if(child.exitCode===null&&child.signalCode===null&&child.pid){process.kill(-child.pid,'SIGKILL');await exited;}rmSync(folder,{recursive:true,force:true});storage.destroy();}
},330000);
