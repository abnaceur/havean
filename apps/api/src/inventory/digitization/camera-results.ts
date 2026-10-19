import {createHash} from 'node:crypto';
import {GetObjectCommand,PutObjectCommand} from '@aws-sdk/client-s3';
import type pg from 'pg';
import type {Actor} from '@haven/database';
import {digitizationCameraResult,digitizationCameraReview,type DigitizationExecutionRequest} from '@haven/contracts';
import {fail,transaction} from '../../platform/core.js';
import {cameraProfile,currentCameraInput,currentCameraRecipe} from './camera-input.js';
import {prepareCpuExecution} from './execution-scope.js';
import {existingRenderReceipt} from './execution-results.js';
import {preparePrivateTrainingFrames} from './frame-privacy.js';
import {beginOutputWrite,finishOutputWrite} from './output-writes.js';
import {captureStorage} from './multipart.js';
import {completeProcessingStage} from './stage-completion.js';
import type {CpuRunnerClient} from './runner-client.js';
import {readWorkspace,requireDigitizationAgency} from './intakes.js';
import {withStageLeaseHeartbeat} from './leases.js';
import {cameraReviewMeasurements} from './camera-quality.js';

async function collectCurrentCameraResult(a:Actor,engine:string,request:DigitizationExecutionRequest,assetId:string,raw:unknown,client:CpuRunnerClient){
 const parsed=digitizationCameraResult.safeParse(raw);if(!parsed.success)fail(422,'The camera result does not match the bounded profile.','RESULT_INVALID');
 const result=parsed.data,stageId=request.stageId,executionId=request.executionId,fence=request.fencingToken;
 const input=await transaction(a,c=>currentCameraInput(c,a,engine,{id:stageId,input_revision:request.inputRevision,input_fingerprint:request.inputFingerprint},assetId));
 const context=await transaction(a,c=>currentCameraRecipe(c,a,engine,input.recipe_id,input.workspace_version,input.input_revision));
 if(result.recipeId!==input.recipe_id||result.inputRevision!==request.inputRevision||result.inputManifestSha256!==input.manifest_sha256||result.recipeFingerprint!==context.recipe.recipe_fingerprint||result.datasetId!==context.recipe.dataset_id||result.report.selectedFrameCount!==context.context.selected.length-context.recipe.recipe.excludedFrameIds.length)fail(422,'The camera result has different input lineage.','RESULT_INVALID');
 const frames=await preparePrivateTrainingFrames(a,engine,input.recipe_id,input.workspace_version,input.input_revision);
 if(createHash('sha256').update(frames).digest('hex')!==input.source.sha256)fail(409,'Prepared camera frames changed.','SOURCE_CONTENT_CHANGED');
 const writer=await beginOutputWrite(a,engine,stageId,executionId,fence,assetId);
 if(!writer)return transaction(a,async c=>(await existingRenderReceipt(c,a,engine,stageId,executionId,fence,assetId))!);
 const storage=captureStorage();
 try{
  const reportBody=Buffer.from(JSON.stringify(result)),items=[{body:reportBody,mime:'application/json',kind:'camera_solve_report',checksum:createHash('sha256').update(reportBody).digest('hex'),suffix:'report.json'}];
  if(result.trainingArchive)items.push({body:await client.trainingArchive(request,result.trainingArchive.sha256,result.trainingArchive.byteSize),mime:'application/x-tar',kind:'camera_training_archive',checksum:result.trainingArchive.sha256,suffix:'training.tar'});
  const outputs:Array<typeof items[number]&{key:string}>=[];
  for(const item of items){
   writer.signal.throwIfAborted();const key=`digitization/${engine}/${request.runId}/${stageId}/${executionId}/${item.checksum}-${item.suffix}`,signal=AbortSignal.any([writer.signal,AbortSignal.timeout(20000)]);
   try{await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:key,Body:item.body,ContentType:item.mime,IfNoneMatch:'*'}),{abortSignal:signal});}catch(error:any){if(error.$metadata?.httpStatusCode!==412)throw error;}
   const stored=await storage.send(new GetObjectCommand({Bucket:'haven-private',Key:key}),{abortSignal:signal});
   if(!stored.Body||stored.ContentLength!==item.body.length){(stored.Body as any)?.destroy?.();fail(422,'Private camera storage does not match.','RESULT_OBJECT_MISMATCH');}
   const hash=createHash('sha256');let size=0;for await(const chunk of stored.Body as AsyncIterable<Uint8Array>){size+=chunk.byteLength;if(size>item.body.length){(stored.Body as any).destroy?.();fail(422,'Private camera storage exceeds its size.','RESULT_OBJECT_MISMATCH');}hash.update(chunk);}
   if(size!==item.body.length||hash.digest('hex')!==item.checksum)fail(422,'Private camera storage does not match.','RESULT_OBJECT_MISMATCH');
   outputs.push({...item,key});
  }
  return await transaction(a,async c=>{
   const prior=await existingRenderReceipt(c,a,engine,stageId,executionId,fence,assetId);if(prior)return prior;
   await prepareCpuExecution(c,a,engine,stageId,executionId,fence,assetId);const ids=[];
   for(const item of outputs){const row=(await c.query(`INSERT INTO artifacts(digitization_id,organization_id,created_by,run_id,stage_id,input_revision,input_fingerprint,object_key,checksum,byte_size,format,profile_id,software_versions,quality_report) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,[engine,a.orgId,a.id,request.runId,stageId,request.inputRevision,request.inputFingerprint,item.key,item.checksum,String(item.body.length),item.mime,cameraProfile,{colmap:'3.10',isolation:'linux-landlock-seccomp-colmap-v1'},{kind:item.kind,...result}])).rows[0];ids.push(row.id);}
   await completeProcessingStage(c,a,engine,request.runId,stageId,executionId,fence);return {executionId,state:'succeeded' as const,artifactIds:ids.sort()};
  });
 }finally{storage.destroy();await finishOutputWrite(a,writer);}
}
export async function latestCameraReview(c:pg.PoolClient,a:Actor,engine:string,stageId?:string){
 await requireDigitizationAgency(c,a);const workspace=await readWorkspace(c,engine);
 const row=(await c.query(`SELECT ar.*,s.input_revision,s.input_fingerprint FROM artifacts ar JOIN processing_stages s ON s.id=ar.stage_id JOIN digitization_camera_inputs input ON input.stage_id=s.id WHERE ar.digitization_id=$1 AND ar.input_revision=$2 AND input.workspace_version=$3 AND s.state='succeeded' AND ar.status='private' AND ar.privacy_status IN('pending','passed') AND ar.profile_id=$4 AND ar.quality_report->>'kind'='camera_solve_report' AND ($5::uuid IS NULL OR s.id=$5) ORDER BY ar.created_at DESC,ar.id DESC LIMIT 1`,[engine,workspace.inputRevision,workspace.version,cameraProfile,stageId??null])).rows[0];
 if(!row)return null;
 await currentCameraInput(c,a,engine,{id:row.stage_id,input_revision:row.input_revision,input_fingerprint:row.input_fingerprint},undefined,false);
 const result=digitizationCameraResult.parse(row.quality_report),report=result.report;
 return digitizationCameraReview.parse({artifactId:row.id,inputRevision:workspace.inputRevision,state:report.state,selectedFrameCount:report.selectedFrameCount,...cameraReviewMeasurements(report.models),nextAction:report.nextAction,trainingArchiveAvailable:!!result.trainingArchive,scaleStatus:'unscaled',reviewRequired:true,publiclyServed:false});
}
export async function readCameraTrainingArchive(a:Actor,engine:string,reportId:string){
 const current=async(c:pg.PoolClient)=>{
  const review=await latestCameraReview(c,a,engine);if(!review||review.artifactId!==reportId||!review.trainingArchiveAvailable)fail(404,'Current private calibrated training input not found.');
  const row=(await c.query("SELECT archive.id,archive.version,archive.checksum,archive.byte_size::text,archive.object_key FROM artifacts report JOIN artifacts archive ON archive.stage_id=report.stage_id AND archive.digitization_id=report.digitization_id WHERE report.id=$1 AND report.digitization_id=$2 AND archive.status='private' AND archive.privacy_status IN('pending','passed') AND archive.format='application/x-tar' AND archive.quality_report->>'kind'='camera_training_archive'",[reportId,engine])).rows[0];
  if(!row||!/^[a-f0-9]{64}$/.test(row.checksum)||!/^[1-9]\d{0,8}$/.test(row.byte_size)||BigInt(row.byte_size)>402653184n||!row.object_key.startsWith(`digitization/${engine}/`)||row.object_key.split('/').some((part:string)=>part==='.'||part==='..'))fail(404,'Current private calibrated training input not found.');return row;
 };
 const archive=await transaction(a,current),storage=captureStorage();let body:Buffer;
 try{
  const stored=await storage.send(new GetObjectCommand({Bucket:'haven-private',Key:archive.object_key}),{abortSignal:AbortSignal.timeout(20000)});
  if(!stored.Body||stored.ContentLength!==Number(archive.byte_size)){(stored.Body as any)?.destroy?.();fail(422,'Private training storage does not match.','RESULT_OBJECT_MISMATCH');}
  const chunks:Buffer[]=[];let size=0;const hash=createHash('sha256');
  for await(const chunk of stored.Body as AsyncIterable<Uint8Array>){size+=chunk.byteLength;if(size>Number(archive.byte_size)){(stored.Body as any).destroy?.();fail(422,'Private training storage exceeds its size.','RESULT_OBJECT_MISMATCH');}chunks.push(Buffer.from(chunk));hash.update(chunk);}
  if(String(size)!==archive.byte_size||hash.digest('hex')!==archive.checksum)fail(422,'Private training storage does not match.','RESULT_OBJECT_MISMATCH');body=Buffer.concat(chunks,size);
 }finally{storage.destroy();}
 await transaction(a,async c=>{if(JSON.stringify(await current(c))!==JSON.stringify(archive))fail(409,'Private training input changed.','FRAME_DATASET_CHANGED');});return body;
}

export async function collectCameraResult(...args:Parameters<typeof collectCurrentCameraResult>){const [a,engine,request]=args;return withStageLeaseHeartbeat(a,engine,request.stageId,request.executionId,request.fencingToken,()=>collectCurrentCameraResult(...args));}
