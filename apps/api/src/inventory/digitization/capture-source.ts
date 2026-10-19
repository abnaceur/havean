import {createHash} from 'node:crypto';
import {GetObjectCommand,PutObjectCommand} from '@aws-sdk/client-s3';
import type pg from 'pg';
import {event,type Actor} from '@haven/database';
import {fail,transaction} from '../../platform/core.js';
import {checkedWorkspace,requireDigitizationAgency} from './intakes.js';
import {checkedCapture} from './capture.js';
import {captureStorage} from './multipart.js';
import {smallVideoContainerMime} from './video-source-container.js';
import {scanFile} from '../scanner.js';
// The confined media profile has a 64 MiB scratch budget. This admission port
// is deliberately bounded; larger multipart originals remain quarantined.
export const capturedSourceBytes=10*1024*1024;
type Promotion={workspaceVersion:number;captureVersion:number};
async function scope(c:pg.PoolClient,a:Actor,engine:string,captureId:string,x?:Promotion){
 await requireDigitizationAgency(c,a);const workspace=await checkedWorkspace(c,engine);
 if(workspace.state!=='active')fail(409,'The workspace no longer accepts capture sources.','WORKFLOW_CONFLICT');
 if(x&&workspace.version!==x.workspaceVersion)fail(409,'The workspace changed. Reload before admitting this source.','VERSION_CONFLICT');
 const capture=await checkedCapture(c,a,engine,captureId,x?.captureVersion);
 if(capture.state!=='complete')fail(409,'Complete the quarantined upload before admitting its source.','CAPTURE_NOT_COMPLETE');
 const receipt=(await c.query('SELECT r.checksum,r.byte_size::text,r.detected_mime,u.rights FROM digitization_capture_receipts r JOIN digitization_capture_uploads u ON u.id=r.capture_id WHERE r.capture_id=$1 AND r.digitization_id=$2 AND r.created_by=$3',[captureId,engine,a.id])).rows[0];
 if(!receipt||receipt.byte_size!==String(capture.expectedBytes)||receipt.detected_mime!==capture.mime)fail(409,'The capture receipt changed.','CAPTURE_RECEIPT_CHANGED');
 if(Number(capture.expectedBytes)>capturedSourceBytes)fail(413,'This capture exceeds the admitted isolated media profile. It remains quarantined.','CAPTURE_SOURCE_PROFILE_TOO_LARGE');
 const existing=(await c.query('SELECT id,object_key,version,status,visibility,purpose,scan_at,capture_source_checksum,capture_source_lease,capture_copy_until FROM media_assets WHERE digitization_capture_id=$1 AND owner_id=$2',[captureId,a.id])).rows[0];
 if(existing&&(!['quarantined','approved'].includes(existing.status)||existing.status==='approved'&&!existing.scan_at||existing.visibility!=='private'||existing.purpose!=='video'||existing.capture_source_checksum!==receipt.checksum))fail(409,'The admitted capture source changed.','CAPTURE_SOURCE_CHANGED');
 return {workspace,capture,receipt,existing};
}
async function readBody(key:string,bytes:number,checksum:string,mime:string,signal:AbortSignal,scan=false){
 const storage=captureStorage();try{const response=await storage.send(new GetObjectCommand({Bucket:'haven-private',Key:key}),{abortSignal:signal});
 if(!response.Body||response.ContentLength!==bytes||bytes>capturedSourceBytes){(response.Body as any)?.destroy?.();fail(422,'The stored capture differs from its receipt.','CAPTURE_OBJECT_MISMATCH');}
 const chunks:Buffer[]=[];let count=0;try{for await(const chunk of response.Body as AsyncIterable<Uint8Array>){count+=chunk.byteLength;if(count>bytes)fail(413,'Capture source exceeds its recorded bytes.','CAPTURE_TOO_LARGE');chunks.push(Buffer.from(chunk));}}finally{(response.Body as any).destroy?.();}
 const body=Buffer.concat(chunks,count);if(count!==bytes||createHash('sha256').update(body).digest('hex')!==checksum||smallVideoContainerMime(body)!==mime)fail(422,'The capture bytes or container changed.','CAPTURE_OBJECT_MISMATCH');
 if(scan)await scanFile(body);return body;
 }finally{storage.destroy();}
}
export async function checkedCapturedSource(c:pg.PoolClient,a:Actor,engine:string,captureId:string,x:Promotion){await scope(c,a,engine,captureId,x);}
export async function reserveCapturedSource(c:pg.PoolClient,a:Actor,engine:string,captureId:string,x:Promotion){
 const current=await scope(c,a,engine,captureId,x),existing=current.existing;
 if(existing?.status==='approved'||existing?.capture_copy_until>new Date())return {assetId:existing.id,leaseId:null};
 const leaseId=crypto.randomUUID();let row;
 if(existing)row=(await c.query("UPDATE media_assets SET capture_source_lease=$2,capture_copy_until=now()+interval '5 minutes',version=version+1 WHERE id=$1 RETURNING id",[existing.id,leaseId])).rows[0];
 else row=(await c.query(`INSERT INTO media_assets(owner_id,object_key,mime,size,rights,visibility,purpose,digitization_capture_id,capture_source_checksum,capture_source_lease,capture_copy_until) VALUES($1,$2,$3,$4,$5,'private','video',$6,$7,$8,now()+interval '5 minutes') RETURNING id`,[a.id,crypto.randomUUID(),current.receipt.detected_mime,current.receipt.byte_size,current.receipt.rights,captureId,current.receipt.checksum,leaseId])).rows[0];
 return {assetId:row.id,leaseId};
}
function sourceRecord(current:any){const row=current.existing;if(!row)return null;return {digitizationId:current.workspace.id,captureId:current.capture.id,workspaceVersion:current.workspace.version,captureVersion:current.capture.version,assetId:row.id,assetVersion:row.version,state:row.status==='approved'?'admitted':'quarantined',mime:current.receipt.detected_mime,bytes:current.receipt.byte_size,decoderState:'requires_isolated_media_decoder',publiclyServed:false};}
export async function readCapturedSource(a:Actor,engine:string,captureId:string){return transaction(a,async c=>sourceRecord(await scope(c,a,engine,captureId)));}
export async function admitCapturedSource(a:Actor,engine:string,captureId:string,x:Promotion,reservation:{assetId:string;leaseId:string|null}){
 const before=await transaction(a,c=>scope(c,a,engine,captureId,x));
 if(before.existing?.id!==reservation.assetId)fail(409,'The capture source reservation changed.','CAPTURE_SOURCE_CHANGED');
 if(before.existing.status==='approved'){
  await readBody('quarantine/'+before.existing.object_key,Number(before.receipt.byte_size),before.receipt.checksum,before.receipt.detected_mime,AbortSignal.timeout(60000),true);
  return transaction(a,async c=>{const fresh=await scope(c,a,engine,captureId,x);if(fresh.existing?.version!==before.existing.version||fresh.existing?.status!=='approved')fail(409,'The capture source changed during verification.','CAPTURE_SOURCE_CHANGED');return sourceRecord(fresh)!;});
 }
 if(!reservation.leaseId)return sourceRecord(before)!;
 if(before.existing.capture_source_lease!==reservation.leaseId||before.existing.capture_copy_until<=new Date())fail(409,'The source copy lease expired.','CAPTURE_SOURCE_LEASE_EXPIRED');
 const signal=AbortSignal.timeout(180000),storage=captureStorage();
 try{
  const body=await readBody(before.capture.objectKey,Number(before.receipt.byte_size),before.receipt.checksum,before.receipt.detected_mime,signal,true);
  try{await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:'quarantine/'+before.existing.object_key,Body:body,ContentType:before.receipt.detected_mime,IfNoneMatch:'*'}),{abortSignal:signal});}catch(error:any){if(error.$metadata?.httpStatusCode!==412)throw error;}
  await readBody('quarantine/'+before.existing.object_key,body.length,before.receipt.checksum,before.receipt.detected_mime,signal);
  return transaction(a,async c=>{const fresh=await scope(c,a,engine,captureId,x);
   if(fresh.existing?.id!==reservation.assetId||fresh.existing.version!==before.existing.version||fresh.existing.capture_source_lease!==reservation.leaseId||fresh.existing.capture_copy_until<=new Date())fail(409,'The capture source copy changed.','CAPTURE_SOURCE_CHANGED');
   await c.query("UPDATE media_assets SET status='approved',scan_at=now(),capture_source_lease=NULL,capture_copy_until=NULL,version=version+1 WHERE id=$1",[reservation.assetId]);
   await event(c,a,engine,'digitization.capture_source_admitted',{captureId,assetId:reservation.assetId});return sourceRecord(await scope(c,a,engine,captureId,x))!;
  });
 }finally{storage.destroy();}
 // Interrupted/rejected copies stay in the durable private reservation. Tenant
 // and account cleanup wait beyond the bounded I/O deadline before removal.
}
