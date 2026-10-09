import '../support/env';
import {afterAll,expect,it} from 'vitest';
import type {FastifyRequest} from 'fastify';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {createIntake} from '../../apps/api/src/inventory/digitization/intakes';
import {DigitizationCaptureController} from '../../apps/api/src/inventory/digitization/capture-controller';
import {reserveCapture,capturePartGrant} from '../../apps/api/src/inventory/digitization/capture';
import type {Identity} from '../../apps/api/src/platform/core';
import {request} from 'node:http';
import {createRequire} from 'node:module';
import {captureStorage} from '../../apps/api/src/inventory/digitization/multipart';
import {verifySmallDigitizationSource} from '../../apps/api/src/inventory/digitization/source-validation';
import {appendInputRevision} from '../../apps/api/src/inventory/digitization/inputs';
const agent:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']};
const foreign:Actor={id:'00000000-0000-4000-8000-000000000011',orgId:'10000000-0000-4000-8000-000000000005',roles:['agent']};
const identity=(a:Actor)=>({actor:async()=>a} as unknown as Identity),req=(url:string,key=crypto.randomUUID())=>({method:'POST',url,headers:{'idempotency-key':key}} as FastifyRequest);
afterAll(()=>pool.end());
it('HE-B02 capture API persists a resumable scoped session, reuses receipts and streams signed parts directly through the real gateway',async()=>{
 process.env.CAPTURE_UPLOAD_ORIGIN='http://localhost:8089';const workspace=await transaction(agent,c=>createIntake(c,agent)),controller=new DigitizationCaptureController(identity(agent)),createReq=req('/api/v1/ops/digitization-intakes/'+workspace.id+'/capture-uploads');
 const x={digitizationVersion:workspace.version,mime:'video/mp4',bytes:8388608+17,rights:'Deterministic multipart integration fixture',authorityConfirmed:true};const created=(await controller.createIntake(createReq,workspace.id,x)).data;
 try{
  expect(created.state).toBe('uploading');expect(created.version).toBe(2);expect(JSON.stringify(created)).not.toMatch(/objectKey|uploadId|S3_SECRET/);expect((await controller.createIntake(createReq,workspace.id,x)).data.id).toBe(created.id);
  await expect(controller.createIntake(createReq,workspace.id,{...x,bytes:x.bytes+1})).rejects.toMatchObject({status:409});
  await expect(new DigitizationCaptureController(identity(foreign)).readIntake(req('/unused'),workspace.id,created.id)).rejects.toMatchObject({status:404});
  await expect(capturePartGrant(agent,workspace.id,created.id,{version:1,partNumber:1})).rejects.toMatchObject({status:409});await expect(capturePartGrant(agent,workspace.id,created.id,{version:2,partNumber:3})).rejects.toMatchObject({status:422});
  const grant=(await controller.partIntake(req('/parts'),workspace.id,created.id,{version:2,partNumber:1})).data;expect(grant.bytes).toBe(8388608);const url=new URL(grant.url),host=url.host;url.hostname='proxy';
  const status=await new Promise<number>((resolve,reject)=>{const upload=request(url,{method:'PUT',headers:{host,'content-length':String(grant.bytes)}},r=>{r.resume();r.on('end',()=>resolve(r.statusCode||0));});upload.on('error',reject);upload.end(Buffer.alloc(grant.bytes,13));});expect(status).toBe(200);
  const resumed=(await new DigitizationCaptureController(identity(agent)).readIntake(req('/read'),workspace.id,created.id)).data;expect(resumed.parts.map(p=>[p.partNumber,p.bytes])).toEqual([[1,8388608]]);
  const session=(await controller.startSession(req('/session'),workspace.id,{workspaceVersion:workspace.version})).data;
  const checklist={version:session.version,inputRevision:session.inputRevision,rooms:[{id:'entrance',name:'Entrance',completed:true},{id:'living',name:'Living room',completed:false}],clips:[{roomId:'entrance',uploadId:created.id}],activeRoomId:'living',state:'recording' as const};
  const saved=(await controller.saveSession(req('/session/save'),workspace.id,session.id,checklist)).data;
  const reopened=new DigitizationCaptureController(identity(agent));expect((await reopened.session(req('/session/read'),workspace.id)).data).toEqual(saved);
  expect((await reopened.readIntake(req('/clip/reopen'),workspace.id,created.id)).data.parts.map(p=>[p.partNumber,p.bytes])).toEqual([[1,8388608]]);
  await expect(reopened.saveSession(req('/stale'),workspace.id,session.id,checklist)).rejects.toMatchObject({status:409});
  await expect(reopened.saveSession(req('/premature'),workspace.id,session.id,{...checklist,version:saved.version,state:'complete'})).rejects.toMatchObject({status:422});
  await expect(reopened.saveSession(req('/duplicate'),workspace.id,session.id,{...checklist,version:saved.version,rooms:[checklist.rooms[0],checklist.rooms[0]]})).rejects.toMatchObject({status:422});
  await expect(new DigitizationCaptureController(identity(foreign)).session(req('/foreign'),workspace.id)).rejects.toMatchObject({status:404});

  const cancelReq=req('/cancel');const cancelled=(await controller.cancelIntake(cancelReq,workspace.id,created.id,{version:2})).data;expect(cancelled.state).toBe('cancelled');expect((await controller.cancelIntake(cancelReq,workspace.id,created.id,{version:2})).data.state).toBe('cancelled');await expect(capturePartGrant(agent,workspace.id,created.id,{version:cancelled.version,partNumber:1})).rejects.toMatchObject({status:409});
 }finally{const current=(await controller.readIntake(req('/cleanup'),workspace.id,created.id)).data;if(current.state!=='cancelled')await controller.cancelIntake(req('/cleanup/cancel'),workspace.id,created.id,{version:current.version});}
},30000);
it('HE-B02 declared 2 GiB clip/20 GiB property quotas and current versions are enforced before storage work',async()=>{
 const rollback=new Error('rollback');try{await transaction(agent,async c=>{const workspace=await createIntake(c,agent);const input={digitizationVersion:workspace.version,mime:'video/mp4',bytes:2147483648,rights:'Synthetic quota reservations without media bytes'};for(let n=0;n<10;n++)await reserveCapture(c,agent,workspace.id,input);await expect(reserveCapture(c,agent,workspace.id,{...input,bytes:1})).rejects.toMatchObject({status:429});await expect(reserveCapture(c,agent,workspace.id,{...input,digitizationVersion:2})).rejects.toMatchObject({status:409});throw rollback;});}catch(error){if(error!==rollback)throw error;}
});
it('HE-F04 changed inputs reject checklist editing but permit immutable discard and a fresh current-input session',async()=>{
 const requireApi=createRequire(new URL('../../apps/api/package.json',import.meta.url)),sharp=requireApi('sharp'),{PutObjectCommand,DeleteObjectCommand}=requireApi('@aws-sdk/client-s3'),storage=captureStorage(),key=crypto.randomUUID(),bytes=await sharp({create:{width:64,height:48,channels:3,background:'#abcdef'}}).png().toBuffer();
 const workspace=await transaction(agent,c=>createIntake(c,agent)),controller=new DigitizationCaptureController(identity(agent)),session=(await controller.startSession(req('/stale-session/start'),workspace.id,{workspaceVersion:1})).data;
 const saved=(await controller.saveSession(req('/stale-session/rooms'),workspace.id,session.id,{version:1,inputRevision:0,rooms:[{id:'entry',name:'Entrance',completed:false}],clips:[],activeRoomId:'entry',state:'recording'})).data;
 try{
  await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key,Body:bytes}));const asset=await transaction(agent,async c=>(await c.query("INSERT INTO media_assets(owner_id,object_key,mime,size,rights,visibility,purpose,status,scan_at) VALUES($1,$2,'image/png',$3,'Self-authored stale capture test pixels','private','floor_plan','approved',now()) RETURNING id,version",[agent.id,key,bytes.length])).rows[0]);
  const source=await verifySmallDigitizationSource(agent,workspace.id,asset.id,asset.version,1,'plan');await transaction(agent,c=>appendInputRevision(c,agent,workspace.id,1,[source]));
  expect((await controller.session(req('/stale-session/reopen'),workspace.id)).data).toMatchObject({id:session.id,stale:true,inputRevision:0});
  const {version,inputRevision,rooms,clips,activeRoomId}=saved,body={version,inputRevision,rooms,clips,activeRoomId,state:'recording' as const};await expect(controller.saveSession(req('/stale-session/edit'),workspace.id,session.id,body)).rejects.toMatchObject({status:409});
  await expect(controller.saveSession(req('/stale-session/discard-edit'),workspace.id,session.id,{...body,rooms:[{...rooms[0],name:'Unauthorized changed room'}],state:'cancelled'})).rejects.toMatchObject({status:422});
  expect((await controller.saveSession(req('/stale-session/discard'),workspace.id,session.id,{...body,state:'cancelled'})).data).toMatchObject({state:'cancelled',stale:true});
  expect((await controller.startSession(req('/stale-session/restart'),workspace.id,{workspaceVersion:2})).data).toMatchObject({inputRevision:1,rooms:[],clips:[],stale:false});
 }finally{await storage.send(new DeleteObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key}));storage.destroy();}
});
