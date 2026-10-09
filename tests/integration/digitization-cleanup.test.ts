import '../support/env';
import {createRequire} from 'node:module';
import {afterAll,expect,it,vi} from 'vitest';
import type {FastifyRequest} from 'fastify';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {createIntake} from '../../apps/api/src/inventory/digitization/intakes';
import {provisionCapture,reserveCapture} from '../../apps/api/src/inventory/digitization/capture';
import * as multipart from '../../apps/api/src/inventory/digitization/multipart';
import {reclaimExpiredCapture} from '../../apps/api/src/inventory/digitization/cleanup';
import {DigitizationWorkerController} from '../../apps/api/src/inventory/digitization/worker-controller';
const requireApi=createRequire(new URL('../../apps/api/package.json',import.meta.url)),pg=requireApi('pg'),{S3Client,UploadPartCommand,PutObjectCommand,HeadObjectCommand,ListPartsCommand,DeleteObjectCommand,AbortMultipartUploadCommand}=requireApi('@aws-sdk/client-s3'),admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL});
const actor:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']};
afterAll(async()=>Promise.all([pool.end(),admin.end()]));
it('HE-K02 expired actual multipart/orphan storage is reclaimed after outage recovery; stale cleanup fences and live captures remain protected',async()=>{
 const storage=multipart.captureStorage(),workspace=await transaction(actor,c=>createIntake(c,actor)),id=crypto.randomUUID(),key=multipart.captureObjectKey(id);
 // Drain only already-expired isolated-project maintenance work before the fixture.
 for(let n=0;n<100;n++){if((await reclaimExpiredCapture()).reclaimed===0)break;}
 await transaction(actor,c=>c.query("INSERT INTO digitization_capture_uploads(id,digitization_id,organization_id,created_by,object_key,mime,expected_bytes,rights,expires_at) VALUES($1,$2,$3,$4,$5,'video/mp4',8388625,'Self-authored expiring multipart test; no valid codec claim',statement_timestamp()+interval '3 seconds')",[id,workspace.id,actor.orgId,actor.id,key]));
 const upload=await provisionCapture(actor,workspace.id,id),row=await transaction(actor,async c=>(await c.query('SELECT upload_id FROM digitization_capture_uploads WHERE id=$1',[id])).rows[0]);
 const live=await transaction(actor,c=>reserveCapture(c,actor,workspace.id,{digitizationVersion:1,bytes:16,mime:'video/mp4',rights:'Live sibling reservation must remain retained'}));
 try{
  await storage.send(new UploadPartCommand({Bucket:'haven-private',Key:key,UploadId:row.upload_id,PartNumber:1,Body:Buffer.alloc(8388608,13)}));
  await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:key,Body:Buffer.alloc(32,17)}));
  expect((await storage.send(new ListPartsCommand({Bucket:'haven-private',Key:key,UploadId:row.upload_id}))).Parts).toHaveLength(1);
  expect((await storage.send(new HeadObjectCommand({Bucket:'haven-private',Key:key}))).ContentLength).toBe(32);
  await expect.poll(async()=>Date.now()>Date.parse(upload.expiresAt),{timeout:5000}).toBe(true);
  const unavailable=new S3Client({endpoint:'http://127.0.0.1:1',region:'us-east-1',forcePathStyle:true,maxAttempts:1,credentials:{accessKeyId:'test-only-cleanup-outage',secretAccessKey:'test-only-cleanup-outage'}}),override=vi.spyOn(multipart,'captureStorage').mockReturnValueOnce(unavailable);
  await expect(reclaimExpiredCapture()).rejects.toBeDefined();override.mockRestore();
  const pending=(await admin.query('SELECT state,fencing_token::text FROM digitization_capture_cleanup_jobs WHERE capture_id=$1',[id])).rows[0];expect(pending).toMatchObject({state:'pending'});
  // Controlled fixture lease expiry tests durable retry, not elapsed-time performance.
  await admin.query("UPDATE digitization_capture_cleanup_jobs SET lease_until=statement_timestamp()-interval '1 second' WHERE capture_id=$1",[id]);
  expect(await reclaimExpiredCapture()).toEqual({reclaimed:1});
  await expect(storage.send(new ListPartsCommand({Bucket:'haven-private',Key:key,UploadId:row.upload_id}))).rejects.toMatchObject({name:'NoSuchUpload'});
  await expect(storage.send(new HeadObjectCommand({Bucket:'haven-private',Key:key}))).rejects.toMatchObject({$metadata:{httpStatusCode:404}});
  expect((await admin.query('SELECT state,fencing_token::text FROM digitization_capture_cleanup_jobs WHERE capture_id=$1',[id])).rows[0]).toEqual({state:'complete',fencing_token:String(BigInt(pending.fencing_token)+1n)});
  await transaction({id:'00000000-0000-4000-8000-000000000010',orgId:null,roles:['admin']},async c=>{expect((await c.query('SELECT digitization_finish_capture_cleanup($1,$2) done',[id,pending.fencing_token])).rows[0].done).toBe(false);});
  await transaction(actor,async c=>{expect((await c.query('SELECT state FROM digitization_capture_uploads WHERE id=$1',[id])).rows[0].state).toBe('expired');expect((await c.query('SELECT state FROM digitization_capture_uploads WHERE id=$1',[live.id])).rows[0].state).toBe('provisioning');});
 }finally{vi.restoreAllMocks();await storage.send(new AbortMultipartUploadCommand({Bucket:'haven-private',Key:key,UploadId:row.upload_id})).catch(()=>undefined);await storage.send(new DeleteObjectCommand({Bucket:'haven-private',Key:key}));storage.destroy();}
},30000);
it('HE-K02 ordinary actors cannot claim private cleanup keys and unsigned maintenance requests reject',async()=>{
 await expect(transaction(actor,c=>c.query('SELECT * FROM digitization_claim_capture_cleanup()'))).rejects.toMatchObject({code:'42501'});
 expect(await transaction(actor,async c=>(await c.query('SELECT * FROM digitization_capture_cleanup_jobs')).rowCount)).toBe(0);
 const old=process.env.DIGITIZATION_COORDINATOR_KEY;process.env.DIGITIZATION_COORDINATOR_KEY='5'.repeat(64);
 try{await expect(new DigitizationWorkerController().cleanup({method:'POST',url:'/api/v1/internal/digitization/maintenance/cleanup',body:{},headers:{}} as FastifyRequest,{})).rejects.toMatchObject({status:401});}finally{if(old===undefined)delete process.env.DIGITIZATION_COORDINATOR_KEY;else process.env.DIGITIZATION_COORDINATOR_KEY=old;}
});
