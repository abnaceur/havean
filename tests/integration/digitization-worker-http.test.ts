import '../support/env';
import {afterAll,expect,it} from 'vitest';
import {spawn} from 'node:child_process';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {createIntake} from '../../apps/api/src/inventory/digitization/intakes';
import {requestRunCancellation} from '../../apps/api/src/inventory/digitization/cancellation';
import {digitizationWorkerHeaders} from '../../packages/config/src/index';
const actor:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']};
afterAll(()=>pool.end());
it('real Nest/Fastify engine command routes enforce separate service authentication, contracts, versions and cancellation',async()=>{
 const key='3'.repeat(64),origin='http://127.0.0.1:9936';
 const child=spawn(process.execPath,['--import','tsx','apps/api/src/main.ts'],{env:{...process.env,TSX_TSCONFIG_PATH:'apps/api/tsconfig.json',API_PORT:'9936',DIGITIZATION_COORDINATOR_KEY:key,DIGITIZATION_CPU_RUNNER_ORIGIN:'',DIGITIZATION_CPU_SIGNING_KEY_FILE:''},stdio:['ignore','ignore','ignore']});
 try{
  const deadline=Date.now()+15000;
  for(;;){if(child.exitCode!==null)throw Error('TEST_API_START_FAILED');try{if((await fetch(origin+'/api/v1/health/live',{signal:AbortSignal.timeout(500)})).ok)break;}catch{/* Wait for actual HTTP readiness before retrying. */}if(Date.now()>deadline)throw Error('TEST_API_NOT_READY');await new Promise(resolve=>setTimeout(resolve,100));}
  const fixture=await transaction(actor,async c=>{
   const engine=await createIntake(c,actor);
   await c.query("INSERT INTO property_input_revisions(digitization_id,organization_id,created_by,revision,source_set) VALUES($1,$2,$3,1,'[]')",[engine.id,actor.orgId,actor.id]);
   await c.query('UPDATE property_digitizations SET current_input_revision=1,version=version+1 WHERE id=$1',[engine.id]);
   const run=(await c.query("INSERT INTO processing_runs(digitization_id,organization_id,created_by,input_revision,desired_outputs,budget,deadline) VALUES($1,$2,$3,1,ARRAY['facts'],'{}',now()+interval '1 hour') RETURNING id",[engine.id,actor.orgId,actor.id])).rows[0].id;
   const stage=(await c.query("INSERT INTO processing_stages(digitization_id,organization_id,created_by,run_id,stage_type,input_revision,input_fingerprint,profile_id) VALUES($1,$2,$3,$4,'document_rasterize',1,$5,'pdfium-150dpi-v1') RETURNING id",[engine.id,actor.orgId,actor.id,run,'a'.repeat(64)])).rows[0].id;
   await c.query("UPDATE processing_runs SET state='queued',version=version+1 WHERE id=$1",[run]);
   await c.query("UPDATE processing_stages SET state='queued',version=version+1 WHERE id=$1",[stage]);
   return {engine:engine.id,run,stage};
  });
  const path=`/api/v1/internal/digitization/stages/${fixture.stage}/lease`,body={engineId:fixture.engine,actorId:actor.id,organizationId:actor.orgId,expectedVersion:2};
  const call=(route:string,value:unknown,secret=key)=>fetch(origin+route,{method:'POST',headers:{Origin:process.env.PUBLIC_WEB_URL!,'Content-Type':'application/json',...digitizationWorkerHeaders('POST',route,value,secret)},body:JSON.stringify(value),signal:AbortSignal.timeout(5000)});
  expect((await call(path,body,'4'.repeat(64))).status).toBe(401);
  const dispatchPath=`/api/v1/internal/digitization/runs/${fixture.run}/dispatch`;
  expect((await call(dispatchPath,body,'4'.repeat(64))).status).toBe(401);
  expect((await call(dispatchPath,{...body,roles:['admin']})).status).toBe(422);
  expect((await call(dispatchPath,body)).status).toBe(409);
  expect((await call(path,{...body,roles:['admin']})).status).toBe(422);
  const admitted=await call(path,body);expect(admitted.status).toBe(201);
  const lease=(await admitted.json()).data;expect(lease).toMatchObject({attempt:1,fencing_token:'1',input_revision:1});
  expect((await call(path,body)).status).toBe(409);
  const active={engineId:fixture.engine,actorId:actor.id,organizationId:actor.orgId,executionId:lease.execution_id,fencingToken:'1'};
  expect((await call(path.replace('/lease','/renew'),active)).status).toBe(201);
  const missing=await call(path.replace('/lease','/prepare'),{...active,assetId:crypto.randomUUID()});expect(missing.status).toBe(404);
  expect(JSON.stringify(await missing.json())).not.toContain('object_key');
  const unavailable=await call(path.replace('/lease','/start'),{...active,assetId:crypto.randomUUID()});expect(unavailable.status).toBe(503);
  expect(JSON.stringify(await unavailable.json())).not.toContain('SIGNING_KEY');
  expect((await call(path.replace('/lease','/collect-renders'),{...active,assetId:crypto.randomUUID()},'4'.repeat(64))).status).toBe(401);
  expect((await call(path.replace('/lease','/collect-renders'),{...active,assetId:crypto.randomUUID()})).status).toBe(503);
  await transaction(actor,c=>requestRunCancellation(c,actor,fixture.engine,fixture.run,3));
  expect((await call(path.replace('/lease','/renew'),active)).status).toBe(409);
  expect(await transaction(actor,async c=>(await c.query('SELECT count(*)::int n FROM stage_attempts WHERE stage_id=$1',[fixture.stage])).rows[0].n)).toBe(1);
 }finally{
  if(child.exitCode===null){const stopped=new Promise<void>(resolve=>child.once('exit',()=>resolve()));child.kill('SIGTERM');await Promise.race([stopped,new Promise<void>(resolve=>setTimeout(resolve,2000))]);if(child.exitCode===null){child.kill('SIGKILL');await stopped;}}
 }
},30000);
