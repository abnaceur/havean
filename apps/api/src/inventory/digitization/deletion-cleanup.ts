import {AbortMultipartUploadCommand,DeleteObjectCommand,DeleteObjectsCommand,HeadObjectCommand,ListObjectsV2Command,ListPartsCommand} from '@aws-sdk/client-s3';
import {transaction,fail} from '../../platform/core.js';
import {captureStorage,captureObjectKey} from './multipart.js';
import {configuredCpuRunner} from './execution-start.js';
import {buildCpuExecutionRequest,cpuSourceFingerprint} from './execution-scope.js';
import type {CpuRunnerClient} from './runner-client.js';
import {cameraProfile} from './camera-input.js';
import {gsplatExportProfile,isGsplatTrainingProfile,configuredGpuRunner} from './training-configuration.js';
import {releaseStoppedTrainingGpu} from './training-gpu.js';
const maintenanceActor={id:'00000000-0000-4000-8000-000000000010',orgId:null,roles:['admin']};
export async function reclaimDeletedAccountProcessing(client?:CpuRunnerClient){
 const job=await transaction(maintenanceActor,async c=>(await c.query('SELECT digitization_claim_deletion_job() job')).rows[0].job);if(!job)return {reclaimed:0};
 if(job.kind==='stop_run'){
  const {author,sources,stages}=job.metadata,stage=stages[0];
  if(stage?.execution_id){
   const runner=client??(isGsplatTrainingProfile(stage.profile_id)?await configuredGpuRunner():await configuredCpuRunner());
   const camera=(isGsplatTrainingProfile(stage.profile_id)||stage.profile_id===gsplatExportProfile)?await transaction(maintenanceActor,async c=>(await c.query('SELECT digitization_training_stop_input($1,$2,$3,$4) source',[job.digitization_id,stage.id,stage.execution_id,String(stage.fencing_token)])).rows[0].source):stage.profile_id===cameraProfile?await transaction(maintenanceActor,async c=>(await c.query('SELECT digitization_camera_stop_input($1,$2,$3,$4) source',[job.digitization_id,stage.id,stage.execution_id,String(stage.fencing_token)])).rows[0].source):null;
   const matched=camera?[camera]:sources.filter((source:any)=>cpuSourceFingerprint(job.digitization_id,author.orgId,stage.input_revision,stage.profile_id,source)===stage.input_fingerprint);
   if(matched.length!==1)fail(503,'Deletion execution scope is ambiguous.','DELETION_EXECUTION_AMBIGUOUS');
   const request=buildCpuExecutionRequest(author,job.digitization_id,stage.id,stage.execution_id,String(stage.fencing_token),stage,matched[0]);
   if(stage.profile_id!==gsplatExportProfile)await runner.purge(request);
   if(isGsplatTrainingProfile(stage.profile_id))await transaction(maintenanceActor,c=>releaseStoppedTrainingGpu(c,stage.id,stage.execution_id,String(stage.fencing_token)));
  }
  const progressed=await transaction(maintenanceActor,async c=>(await c.query('SELECT digitization_advance_deletion_run($1,$2,$3) done',[job.id,job.fence,stage?.execution_id??null])).rows[0].done);return {reclaimed:progressed?1:0};
 }else if(job.kind==='run_outputs'){
  const prefix=`digitization/${job.digitization_id}/${job.run_id}/`;
  if(job.object_key!==prefix||job.metadata.category!=='run_outputs'||!/^digitization\/[a-f0-9-]{36}\/[a-f0-9-]{36}\/$/.test(prefix))fail(503,'Deletion output scope is invalid.','DELETION_OBJECT_INVALID');
  const storage=captureStorage(),signal=AbortSignal.timeout(20000);
  try{
   const listing=await storage.send(new ListObjectsV2Command({Bucket:'haven-private',Prefix:prefix,MaxKeys:1000}),{abortSignal:signal});
   const keys=(listing.Contents??[]).map(object=>object.Key);
   if(!keys.length&&listing.IsTruncated)fail(503,'Processing output listing is incomplete.','DELETION_STORAGE_PENDING');
   if(keys.some(key=>!key||!key.startsWith(prefix)||key.split('/').some(part=>part==='.'||part==='..')))fail(503,'Deletion output lineage is invalid.','DELETION_OBJECT_INVALID');
   if(keys.length){const deleted=await storage.send(new DeleteObjectsCommand({Bucket:'haven-private',Delete:{Objects:keys.map(Key=>({Key})),Quiet:true}}),{abortSignal:signal});if(deleted.Errors?.length)fail(503,'Processing output deletion is not confirmed.','DELETION_STORAGE_PENDING');}
   const remaining=await storage.send(new ListObjectsV2Command({Bucket:'haven-private',Prefix:prefix,MaxKeys:1}),{abortSignal:signal});
   if(remaining.Contents?.length||remaining.IsTruncated){const progressed=await transaction(maintenanceActor,async c=>(await c.query('SELECT digitization_continue_run_output_cleanup($1,$2) done',[job.id,job.fence])).rows[0].done);return {reclaimed:progressed?1:0};}
  }finally{storage.destroy();}
 }else{
  const {category,assetId,captureId}=job.metadata;
  const safe=category==='original'?/^quarantine\/[a-f0-9-]{36}$/.test(job.object_key)&&typeof assetId==='string':category==='capture'?job.object_key===captureObjectKey(captureId):category==='artifact'?job.object_key.startsWith(`digitization/${job.digitization_id}/`)&&!job.object_key.split('/').some((part:string)=>part==='.'||part==='..'):false;
  if(!safe)fail(503,'Deletion object lineage is invalid.','DELETION_OBJECT_INVALID');
  const storage=captureStorage(),send=(command:any)=>storage.send(command,{abortSignal:AbortSignal.timeout(5000)});
  try{
   if(job.upload_id){try{await send(new AbortMultipartUploadCommand({Bucket:'haven-private',Key:job.object_key,UploadId:job.upload_id}));}catch(e:any){if(e.name!=='NoSuchUpload')throw e;}try{await send(new ListPartsCommand({Bucket:'haven-private',Key:job.object_key,UploadId:job.upload_id}));fail(503,'Deleted multipart termination is not confirmed.','DELETION_STORAGE_PENDING');}catch(e:any){if(e.name!=='NoSuchUpload')throw e;}}
   await send(new DeleteObjectCommand({Bucket:'haven-private',Key:job.object_key}));
   try{await send(new HeadObjectCommand({Bucket:'haven-private',Key:job.object_key}));fail(503,'Processing deletion is not confirmed.','DELETION_STORAGE_PENDING');}catch(e:any){if(e.$metadata?.httpStatusCode!==404)throw e;}
  }finally{storage.destroy();}
 }
 const done=await transaction(maintenanceActor,async c=>(await c.query('SELECT digitization_finish_deletion_job($1,$2) done',[job.id,job.fence])).rows[0].done);return {reclaimed:done?1:0};
}
