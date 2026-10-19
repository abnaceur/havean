import '../support/env';
import {afterAll,expect,it} from 'vitest';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {existsSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import type {FastifyRequest} from 'fastify';
import type {Identity} from '../../apps/api/src/platform/core';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {createIntake} from '../../apps/api/src/inventory/digitization/intakes';
import {appendInputRevision} from '../../apps/api/src/inventory/digitization/inputs';
import {captureStorage} from '../../apps/api/src/inventory/digitization/multipart';
import {verifySmallDigitizationSource} from '../../apps/api/src/inventory/digitization/source-validation';
import {startPrivateSourceProcessing} from '../../apps/api/src/inventory/digitization/processing';
import {prepareCpuExecution} from '../../apps/api/src/inventory/digitization/execution-scope';
import {leaseStage} from '../../apps/api/src/inventory/digitization/leases';
import {startCpuExecution} from '../../apps/api/src/inventory/digitization/execution-start';
import {CpuRunnerClient} from '../../apps/api/src/inventory/digitization/runner-client';
import {DigitizationTenantDeletionController} from '../../apps/api/src/inventory/digitization/tenant-deletion-controller';
import {reclaimDeletedAccountProcessing} from '../../apps/api/src/inventory/digitization/deletion-cleanup';
const requireApi=createRequire(new URL('../../apps/api/package.json',import.meta.url)),{Pool}=requireApi('pg'),sharp=requireApi('sharp'),{PutObjectCommand,HeadObjectCommand,DeleteObjectCommand,ListObjectsV2Command}=requireApi('@aws-sdk/client-s3');
const inspect=new Pool({connectionString:process.env.MIGRATION_DATABASE_URL}),origin=process.env.DIGITIZATION_RUNNER_TEST_ORIGIN;
const identity=(actor:Actor)=>({actor:async()=>actor} as unknown as Identity),request=()=>({method:'POST',url:'/owned-output-erasure',headers:{'idempotency-key':crypto.randomUUID()}} as unknown as FastifyRequest);
afterAll(async()=>{await inspect.end();await pool.end();});
it.skipIf(!origin)('actual derived collector SIGKILL leaves a durable private lease; erasure waits, removes uncommitted bytes and preserves another prefix',async()=>{
 const client=new CpuRunnerClient(origin!,Buffer.from('test-only-private-key-not-a-production-credential-0000'));
 for(let n=0;n<128;n++){if(!(await reclaimDeletedAccountProcessing(client)).reclaimed)break;}
 const org=crypto.randomUUID(),id=crypto.randomUUID(),actor:Actor={id,orgId:org,roles:['agency_manager']};
 await inspect.query("INSERT INTO organizations(id,name,type) VALUES($1,'Synthetic derived writer erasure tenant','agency')",[org]);
 await inspect.query("INSERT INTO profiles(id,subject,display_name,email,email_verified) VALUES($1,$2,'Synthetic derived writer manager',$3,true)",[id,'derived-writer-'+id,'derived-writer-'+id+'@example.test']);
 await inspect.query("INSERT INTO memberships(user_id,organization_id,role,status) VALUES($1,$2,'agency_manager','active')",[id,org]);
 const workspace=await transaction(actor,c=>createIntake(c,actor)),storage=captureStorage(),sourceKey=crypto.randomUUID(),bytes=await sharp({create:{width:256,height:128,channels:3,background:'#516273'}}).png().toBuffer();
 await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:'quarantine/'+sourceKey,Body:bytes}));
 const asset=await transaction(actor,async c=>(await c.query("INSERT INTO media_assets(owner_id,object_key,mime,size,rights,visibility,purpose,status,scan_at) VALUES($1,$2,'image/png',$3,'Self-authored derived writer erasure fixture','private','floor_plan','approved',now()) RETURNING id,version",[id,sourceKey,bytes.length])).rows[0]);
 const source=await verifySmallDigitizationSource(actor,workspace.id,asset.id,asset.version,1,'plan');await transaction(actor,c=>appendInputRevision(c,actor,workspace.id,1,[source]));
 const run=await transaction(actor,c=>startPrivateSourceProcessing(c,actor,workspace.id,{version:2,inputRevision:1,assetId:asset.id,output:'plan',locale:'en'})),stage=run.stageIds[0],lease=await transaction(actor,c=>leaseStage(c,actor,workspace.id,stage,2)),fence=String(lease.fencing_token),command=await transaction(actor,c=>prepareCpuExecution(c,actor,workspace.id,stage,lease.execution_id,fence,asset.id));
 await startCpuExecution(actor,workspace.id,stage,lease.execution_id,fence,asset.id,client);
 const runnerDeadline=Date.now()+15000;while((await client.read(command)).state!=='succeeded'){if(Date.now()>runnerDeadline)throw Error('OWNED_DERIVED_DECODER_TIMEOUT');await new Promise(resolve=>setTimeout(resolve,100));}
 const prefix=`digitization/${workspace.id}/${run.id}/`,otherKey=`digitization/${crypto.randomUUID()}/${crypto.randomUUID()}/authored-other-scope.json`,otherBytes=Buffer.from('{"fixture":"authored other scope; no customer evidence"}');
 await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:otherKey,Body:otherBytes}));
 const folder=mkdtempSync(path.join(tmpdir(),'haven-derived-writer-')),payloadFile=path.join(folder,'scope.json'),markerFile=path.join(folder,'copied.json');
 writeFileSync(payloadFile,JSON.stringify({actor,engine:workspace.id,stage,execution:lease.execution_id,fence,asset:asset.id,origin,prefix}),{mode:0o600});
 const child=spawn(process.execPath,[path.resolve('node_modules/tsx/dist/cli.mjs'),'tests/support/digitization-output-writer-fixture.ts',payloadFile,markerFile],{detached:true,stdio:'ignore',env:{...process.env,TSX_TSCONFIG_PATH:'apps/api/tsconfig.json'}}),exited=new Promise<{code:number|null;signal:NodeJS.Signals|null}>(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
 try{
  const boundaryDeadline=Date.now()+30000;while(!existsSync(markerFile)&&child.exitCode===null&&child.signalCode===null&&Date.now()<boundaryDeadline)await new Promise(resolve=>setTimeout(resolve,100));
  if(existsSync(markerFile+'.failed'))console.info(readFileSync(markerFile+'.failed','utf8'));
  expect(existsSync(markerFile)).toBe(true);expect(JSON.parse(readFileSync(markerFile,'utf8'))).toEqual({actualDerivedCopyCompleted:true});
  const writer=(await inspect.query('SELECT id,version,state,write_until FROM digitization_output_writes WHERE run_id=$1',[run.id])).rows[0];expect(writer).toMatchObject({version:1,state:'writing'});
  expect((await inspect.query('SELECT count(*)::int n FROM artifacts WHERE run_id=$1',[run.id])).rows[0].n).toBe(0);
  const foreign:Actor={id:'00000000-0000-4000-8000-000000000011',orgId:'10000000-0000-4000-8000-000000000005',roles:['agency_manager']};
  await expect(transaction(foreign,c=>c.query('SELECT digitization_finish_output_write($1,$2)',[writer.id,1]))).rejects.toMatchObject({code:'42501'});
  await expect(transaction(actor,c=>c.query('SELECT digitization_finish_output_write($1,$2)',[writer.id,2]))).rejects.toMatchObject({code:'40001'});
  expect((await transaction(actor,c=>c.query("UPDATE digitization_output_writes SET write_until=now()+interval '1 second' WHERE id=$1",[writer.id]))).rowCount).toBe(0);
  process.kill(-child.pid!,'SIGKILL');expect(await exited).toEqual({code:null,signal:'SIGKILL'});
  const admin:Actor={id:'00000000-0000-4000-8000-000000000010',orgId:null,roles:['admin']},api=new DigitizationTenantDeletionController(identity(admin)),context=(await api.context(request(),org)).data;
  await api.request(request(),org,{scopeVersion:context.scopeVersion,deletionConfirmed:true,reason:'Erase actual killed synthetic derived writer output'});
  for(let n=0;n<128;n++){if(!(await reclaimDeletedAccountProcessing(client)).reclaimed)break;}
  expect((await api.context(request(),org)).data.request).toMatchObject({pendingJobs:2,retainedOriginals:0});
  const listed=await storage.send(new ListObjectsV2Command({Bucket:'haven-private',Prefix:prefix,MaxKeys:10})) as {Contents?:Array<{Key:string}>};expect(listed.Contents).toHaveLength(1);
  console.info(JSON.stringify({label:'P',actualCollectorSigkill:true,uncommittedObjects:1,writerLeaseLive:true,deletionDeferred:true}));
  const deadline=new Date(writer.write_until).getTime()+1000;while(Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,Math.min(1000,deadline-Date.now())));
  for(let n=0;n<128;n++){if(!(await reclaimDeletedAccountProcessing(client)).reclaimed)break;}
  expect((await api.context(request(),org)).data.request).toMatchObject({pendingJobs:0,retainedOriginals:0});
  for(const key of ['quarantine/'+sourceKey,...listed.Contents!.map(object=>object.Key)])await expect(storage.send(new HeadObjectCommand({Bucket:'haven-private',Key:key}))).rejects.toMatchObject({$metadata:{httpStatusCode:404}});
  expect(((await storage.send(new ListObjectsV2Command({Bucket:'haven-private',Prefix:prefix,MaxKeys:1}))) as {Contents?:unknown[]}).Contents??[]).toEqual([]);
  expect((await storage.send(new HeadObjectCommand({Bucket:'haven-private',Key:otherKey})) as {ContentLength:number}).ContentLength).toBe(otherBytes.length);
  await expect(transaction(actor,c=>prepareCpuExecution(c,actor,workspace.id,stage,lease.execution_id,fence,asset.id))).rejects.toMatchObject({status:404});
  expect((await inspect.query('SELECT state FROM profiles WHERE id=$1',[id])).rows[0].state).toBe('active');
 }finally{
  if(child.exitCode===null&&child.signalCode===null&&child.pid){process.kill(-child.pid,'SIGKILL');await exited;}
  rmSync(folder,{recursive:true,force:true});await storage.send(new DeleteObjectCommand({Bucket:'haven-private',Key:otherKey}));storage.destroy();
 }
},360000);
