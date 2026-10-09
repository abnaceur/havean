import {AbortMultipartUploadCommand,DeleteObjectCommand,HeadObjectCommand,ListPartsCommand} from '@aws-sdk/client-s3';
import {transaction,fail} from '../../platform/core.js';
import {captureStorage,captureObjectKey} from './multipart.js';
// Service-only maintenance identity. It cannot be supplied by an HTTP actor.
const maintenanceActor={id:'00000000-0000-4000-8000-000000000010',orgId:null,roles:['admin']};
export async function reclaimExpiredCapture(){
 const claimed=await transaction(maintenanceActor,async c=>(await c.query('SELECT * FROM digitization_claim_capture_cleanup()')).rows[0]);if(!claimed)return {reclaimed:0};
 if(claimed.object_key!==captureObjectKey(claimed.capture_id))fail(503,'Expired capture lineage is invalid.','CAPTURE_CLEANUP_INVALID');
 const storage=captureStorage(),send=(command:any)=>storage.send(command,{abortSignal:AbortSignal.timeout(5000)});
 try{
  if(claimed.upload_id){
   try{await send(new AbortMultipartUploadCommand({Bucket:'haven-private',Key:claimed.object_key,UploadId:claimed.upload_id}));}catch(e:any){if(e.name!=='NoSuchUpload')throw e;}
   try{await send(new ListPartsCommand({Bucket:'haven-private',Key:claimed.object_key,UploadId:claimed.upload_id}));fail(503,'Expired multipart closure is not confirmed.','CAPTURE_CLEANUP_PENDING');}catch(e:any){if(e.name!=='NoSuchUpload')throw e;}
  }
  await send(new DeleteObjectCommand({Bucket:'haven-private',Key:claimed.object_key}));
  try{await send(new HeadObjectCommand({Bucket:'haven-private',Key:claimed.object_key}));fail(503,'Expired capture deletion is not confirmed.','CAPTURE_CLEANUP_PENDING');}catch(e:any){if(e.$metadata?.httpStatusCode!==404)throw e;}
  const finished=await transaction(maintenanceActor,async c=>(await c.query('SELECT digitization_finish_capture_cleanup($1,$2) done',[claimed.capture_id,claimed.fencing_token])).rows[0].done);return {reclaimed:finished?1:0};
 }finally{storage.destroy();}
}
