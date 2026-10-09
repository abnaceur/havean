import '../support/env';
import {afterAll,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {request} from 'node:http';
import type {FastifyRequest} from 'fastify';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {createIntake} from '../../apps/api/src/inventory/digitization/intakes';
import {DigitizationCaptureController} from '../../apps/api/src/inventory/digitization/capture-controller';
import type {Identity} from '../../apps/api/src/platform/core';
import {captureStorage,captureObjectKey} from '../../apps/api/src/inventory/digitization/multipart';
const {DeleteObjectCommand,UploadPartCommand}=createRequire(new URL('../../apps/api/package.json',import.meta.url))('@aws-sdk/client-s3');
const actor:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']};
const foreign:Actor={id:'00000000-0000-4000-8000-000000000011',orgId:'10000000-0000-4000-8000-000000000005',roles:['agent']};
const identity=(a:Actor)=>({actor:async()=>a} as unknown as Identity),req=(url:string,key=crypto.randomUUID())=>({method:'POST',url,headers:{'idempotency-key':key}} as FastifyRequest);
afterAll(()=>pool.end());
async function uploaded(mime:'video/mp4'|'video/quicktime',body:Buffer,declaredBytes=body.length){
 process.env.CAPTURE_UPLOAD_ORIGIN='http://localhost:8089';
 const workspace=await transaction(actor,c=>createIntake(c,actor)),controller=new DigitizationCaptureController(identity(actor));
 const capture=(await controller.createIntake(req('/capture'),workspace.id,{digitizationVersion:workspace.version,mime,bytes:declaredBytes,rights:'Repository synthetic movie fixture; no reconstruction acceptance',authorityConfirmed:true})).data;
 const grant=(await controller.partIntake(req('/part'),workspace.id,capture.id,{version:capture.version,partNumber:1})).data,url=new URL(grant.url),host=url.host;url.hostname='proxy';
 const status=await new Promise<number>((resolve,reject)=>{const transfer=request(url,{method:'PUT',headers:{host,'content-length':String(body.length)}},response=>{response.resume();response.on('end',()=>resolve(response.statusCode||0));});transfer.on('error',reject);transfer.end(body);});
 if(declaredBytes===body.length)expect(status).toBe(200);else{
  expect(status).toBe(403); // The signed browser grant binds exact Content-Length.
  // Fault injection through the fixture's private storage credential proves the
  // API also checks authoritative parts after bypassing the browser grant.
  const row=await transaction(actor,async c=>(await c.query('SELECT upload_id,object_key FROM digitization_capture_uploads WHERE id=$1',[capture.id])).rows[0]),storage=captureStorage();
  try{await storage.send(new UploadPartCommand({Bucket:'haven-private',Key:row.object_key,UploadId:row.upload_id,PartNumber:1,Body:body}));}finally{storage.destroy();}
 }
 return {workspace,controller,capture};
}
it('actual signed multipart completion stores one private quarantine receipt, survives lost commit/checksum retry and never approves processing',async()=>{
 const bytes=await readFile('packages/test-support/assets/property-demo.mp4'),checksum=createHash('sha256').update(bytes).digest('hex'),{workspace,controller,capture}=await uploaded('video/mp4',bytes),storage=captureStorage();
 try{
  await expect(controller.completeIntake(req('/complete/wrong'),workspace.id,capture.id,{version:capture.version,checksum:'0'.repeat(64)})).rejects.toMatchObject({status:422});
  expect(await transaction(actor,async c=>(await c.query('SELECT count(*)::int n FROM digitization_capture_receipts WHERE capture_id=$1',[capture.id])).rows[0].n)).toBe(0);
  expect((await controller.readIntake(req('/resumed'),workspace.id,capture.id)).data).toMatchObject({state:'uploading',completionRequired:true,parts:[]});
  const command=req('/complete'),body={version:capture.version,checksum};
  const receipt=(await controller.completeIntake(command,workspace.id,capture.id,body)).data;
  expect(receipt).toMatchObject({status:'quarantined',processingEligible:false,checksum,bytes:bytes.length,version:3});
  expect((await controller.completeIntake(command,workspace.id,capture.id,body)).data).toEqual(receipt);
  await expect(controller.completeIntake(command,workspace.id,capture.id,{...body,checksum:'1'.repeat(64)})).rejects.toMatchObject({status:409});
  await expect(new DigitizationCaptureController(identity(foreign)).completeIntake(req('/foreign'),workspace.id,capture.id,body)).rejects.toMatchObject({status:404});
  await transaction(actor,async c=>{
   expect((await c.query('SELECT status,checksum,byte_size::text FROM digitization_capture_receipts WHERE capture_id=$1',[capture.id])).rows).toEqual([{status:'quarantined',checksum,byte_size:String(bytes.length)}]);
   expect((await c.query("SELECT count(*)::int n FROM outbox WHERE aggregate_id=$1 AND kind='digitization.capture_quarantined'",[workspace.id])).rows[0].n).toBe(1);
  });
 }finally{await storage.send(new DeleteObjectCommand({Bucket:'haven-private',Key:captureObjectKey(capture.id)}));storage.destroy();}
},30000);
it('a declared QuickTime MIME cannot approve or bind an actual MPEG-4 capture',async()=>{
 const bytes=await readFile('packages/test-support/assets/property-demo.mp4'),checksum=createHash('sha256').update(bytes).digest('hex'),{workspace,controller,capture}=await uploaded('video/quicktime',bytes),storage=captureStorage();
 try{
  await expect(controller.completeIntake(req('/mismatch'),workspace.id,capture.id,{version:capture.version,checksum})).rejects.toMatchObject({status:422});
  expect(await transaction(actor,async c=>(await c.query('SELECT count(*)::int n FROM digitization_capture_receipts WHERE capture_id=$1',[capture.id])).rows[0].n)).toBe(0);
 }finally{await storage.send(new DeleteObjectCommand({Bucket:'haven-private',Key:captureObjectKey(capture.id)}));storage.destroy();}
},30000);

it('authoritative stored multipart bytes above their capture intent cannot receive a quarantine receipt or processing grant',async()=>{
 const bytes=await readFile('packages/test-support/assets/property-demo.mp4'),checksum=createHash('sha256').update(bytes).digest('hex'),{workspace,controller,capture}=await uploaded('video/mp4',bytes,bytes.length-1),storage=captureStorage();
 try{
  await expect(controller.completeIntake(req('/oversized'),workspace.id,capture.id,{version:capture.version,checksum})).rejects.toMatchObject({status:422});
  expect(await transaction(actor,async c=>(await c.query('SELECT count(*)::int n FROM digitization_capture_receipts WHERE capture_id=$1',[capture.id])).rows[0].n)).toBe(0);
  expect((await controller.readIntake(req('/resume-oversized'),workspace.id,capture.id)).data.parts[0].bytes).toBe(bytes.length);
  await controller.cancelIntake(req('/cancel-oversized'),workspace.id,capture.id,{version:capture.version});
 }finally{storage.destroy();}
},30000);
