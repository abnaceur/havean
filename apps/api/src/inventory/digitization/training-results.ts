import {createHash} from 'node:crypto';
import sharp from 'sharp';
import type pg from 'pg';
import {event,type Actor} from '@haven/database';
import {digitizationTrainingResult,inspectSplat,type DigitizationExecutionRequest} from '@haven/contracts';
import {fail,transaction} from '../../platform/core.js';
import {currentTrainingInput} from './training-input.js';
import {currentTrainingGpu,releaseStoppedTrainingGpu} from './training-gpu.js';
import {prepareCpuExecution} from './execution-scope.js';
import {existingRenderReceipt} from './execution-results.js';
import {beginOutputWrite,finishOutputWrite} from './output-writes.js';
import {readTrainingBytes,storeTrainingBytes} from './training-storage.js';
import {completeProcessingStage} from './stage-completion.js';
import {recordProcessingOutcome} from './processing-metrics.js';
import {skipTerminalDependents,finalizePrivateProcessingRun} from './run-finalization.js';
import type {CpuRunnerClient} from './runner-client.js';
type Output={body:Buffer;mime:string;suffix:string;quality:Record<string,unknown>};

function validateTrainingPly(body:Buffer,count:number){
 const names=['x','y','z','f_dc_0','f_dc_1','f_dc_2','opacity','scale_0','scale_1','scale_2','rot_0','rot_1','rot_2','rot_3'];
 const header=Buffer.from(`ply\nformat binary_little_endian 1.0\nelement vertex ${count}\n`+names.map(name=>`property float ${name}\n`).join('')+'end_header\n');
 if(body.length!==header.length+count*56||!body.subarray(0,header.length).equals(header))fail(422,'Invalid trained PLY structure.','TRAINING_RESULT_INVALID');
 for(let offset=header.length;offset<body.length;offset+=4)if(!Number.isFinite(body.readFloatLE(offset)))fail(422,'Nonfinite trained PLY attributes.','TRAINING_RESULT_INVALID');
}

async function persist(a:Actor,engine:string,r:DigitizationExecutionRequest,asset:string,outputs:Output[],gpu=false,verify?:(c:pg.PoolClient)=>Promise<void>){
 const writer=await beginOutputWrite(a,engine,r.stageId,r.executionId,r.fencingToken,asset);
 if(!writer)return transaction(a,async c=>(await existingRenderReceipt(c,a,engine,r.stageId,r.executionId,r.fencingToken,asset))!);
 const stored:Array<{key:string;checksum:string;item:Output}>=[];let size=0;
 try{
  for(const item of outputs){
   size+=item.body.length;if(size>64*1024*1024)fail(422,'Scene output exceeds its bound.','TRAINING_RESULT_INVALID');
   const checksum=createHash('sha256').update(item.body).digest('hex'),key=`digitization/${engine}/${r.runId}/${r.stageId}/${r.executionId}/${item.suffix}-${checksum}`;
   await storeTrainingBytes(engine,key,item.body,item.mime,AbortSignal.any([writer.signal,AbortSignal.timeout(20000)]));stored.push({key,checksum,item});
  }
  return await transaction(a,async c=>{
   const prior=await existingRenderReceipt(c,a,engine,r.stageId,r.executionId,r.fencingToken,asset);if(prior)return prior;
   await prepareCpuExecution(c,a,engine,r.stageId,r.executionId,r.fencingToken,asset);
   await verify?.(c);
   if(gpu)await currentTrainingGpu(c,r.stageId,r.executionId,r.fencingToken);
   const ids=[];
   for(const {key,checksum,item} of stored){const row=(await c.query(`INSERT INTO artifacts(digitization_id,organization_id,created_by,run_id,stage_id,input_revision,input_fingerprint,object_key,checksum,byte_size,format,profile_id,software_versions,quality_report) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,[engine,a.orgId,a.id,r.runId,r.stageId,r.inputRevision,r.inputFingerprint,key,checksum,String(item.body.length),item.mime,r.profileId,{torch:'2.7.1+cu126',gsplat:'1.5.3',cuda:'12.6'},item.quality])).rows[0];ids.push(row.id);}
   await completeProcessingStage(c,a,engine,r.runId,r.stageId,r.executionId,r.fencingToken);
   if(gpu)await releaseStoppedTrainingGpu(c,r.stageId,r.executionId,r.fencingToken);
   return {executionId:r.executionId,state:'succeeded' as const,artifactIds:ids.sort()};
  });
 }finally{await finishOutputWrite(a,writer);}
}
export async function collectTrainingExecution(a:Actor,engine:string,r:DigitizationExecutionRequest,asset:string,client:CpuRunnerClient){
 const receipt=await client.read(r);
 if(receipt.processStopped!==true||!['succeeded','failed_terminal','failed_retryable','cancelled'].includes(receipt.state))fail(409,'Scene training has not stopped with a result.','RESULT_NOT_READY');
 if(receipt.state!=='succeeded'){
  await transaction(a,async c=>{
   await prepareCpuExecution(c,a,engine,r.stageId,r.executionId,r.fencingToken,asset);
   await c.query("UPDATE processing_stages SET state='failed_terminal',error_code='GPU_TRAINING_FAILED',version=version+1 WHERE id=$1",[r.stageId]);
   await recordProcessingOutcome(c,a,engine,r.stageId,r.executionId,r.fencingToken);await skipTerminalDependents(c,engine,r.runId,r.stageId);await finalizePrivateProcessingRun(c,engine,r.runId);
   await releaseStoppedTrainingGpu(c,r.stageId,r.executionId,r.fencingToken);
   await event(c,a,engine,'digitization.stage_failed',{runId:r.runId,stageId:r.stageId,executionId:r.executionId,state:'failed_terminal'});
  });
  fail(422,'Scene training did not complete. Check captures and the training runtime before starting a new job.','GPU_TRAINING_FAILED');
 }
 const parsed=digitizationTrainingResult.safeParse(receipt.result);if(!parsed.success)fail(422,'Invalid bounded scene training result.','TRAINING_RESULT_INVALID');const result=parsed.data;if(result.processingProfile!==r.profileId)fail(422,'Training profile changed.','TRAINING_RESULT_INVALID');
 const input=await transaction(a,async c=>{await currentTrainingGpu(c,r.stageId,r.executionId,r.fencingToken);return currentTrainingInput(c,a,engine,{id:r.stageId,input_revision:r.inputRevision,input_fingerprint:r.inputFingerprint},asset);});
 if(result.inputArchiveSha256!==input.source.sha256||result.datasetFingerprint!==input.dataset_fingerprint)fail(422,'Scene training used different calibrated inputs.','TRAINING_RESULT_INVALID');
 const outputs:Output[]=[{body:Buffer.from(JSON.stringify(result)),mime:'application/json',suffix:'report.json',quality:{kind:'splat_training_report',result}}];
 for(const output of result.outputs){
  const body=await client.trainingOutput(r,output);
  if(output.kind==='splat_training_tier'){
   try{const inspected=inspectSplat(Uint8Array.from(body).buffer);if(inspected.count!==output.splatCount)throw Error('Count mismatch');}catch{fail(422,'The trained scene encoding is invalid.','TRAINING_RESULT_INVALID');}
  }else if(output.kind==='held_out_render'){
   const metadata=await sharp(body,{limitInputPixels:1024*1024,failOn:'warning'}).metadata();if(metadata.format!=='png'||metadata.width!==output.width||metadata.height!==output.height)fail(422,'Held-out image dimensions changed.','TRAINING_RESULT_INVALID');
  }else validateTrainingPly(body,output.splatCount);
  outputs.push({body,mime:output.mime,suffix:output.kind==='held_out_render'?`held-out-${output.index}.png`:output.kind==='splat_training_tier'?`${output.tier}.splat`:'scene.ply',quality:{...output,datasetFingerprint:result.datasetFingerprint,scale:null,roomCoverage:null,reviewRequired:true,publiclyServed:false}});
 }
 return persist(a,engine,r,asset,outputs,true);
}
export async function collectSceneExport(a:Actor,engine:string,r:DigitizationExecutionRequest,asset:string){
 const current=async(c:pg.PoolClient)=>{
  const input=await currentTrainingInput(c,a,engine,{id:r.stageId,input_revision:r.inputRevision,input_fingerprint:r.inputFingerprint},asset);
  const rows=(await c.query(`SELECT ar.* FROM artifacts ar JOIN processing_stages s ON s.id=ar.stage_id WHERE ar.stage_id=$1 AND ar.digitization_id=$2 AND s.state='succeeded' AND ar.status='private' AND ar.privacy_status IN('pending','passed') ORDER BY ar.id`,[input.stage_id,engine])).rows;
  const report=rows.find(row=>row.quality_report.kind==='splat_training_report');if(!report)fail(409,'Scene training results are not ready.','RESULT_NOT_READY');
  const result=digitizationTrainingResult.parse(report.quality_report.result),tiers=rows.filter(row=>row.quality_report.kind==='splat_training_tier');
  if(tiers.length!==2||result.datasetFingerprint!==input.dataset_fingerprint)fail(422,'The trained scene changed.','TRAINING_RESULT_INVALID');
  for(const row of tiers){const expected=result.outputs.find(o=>o.kind==='splat_training_tier'&&o.tier===row.quality_report.tier);if(!expected||row.checksum!==expected.sha256||String(row.byte_size)!==expected.byteSize)fail(422,'Scene tier lineage changed.','TRAINING_RESULT_INVALID');}
  return {input,tiers};
 };
 const context=await transaction(a,current);
 const outputs:Output[]=[];
 for(const row of context.tiers){
  const body=await readTrainingBytes({...row,byte_size:String(row.byte_size)},engine);try{inspectSplat(Uint8Array.from(body).buffer);}catch{fail(422,'Invalid viewer scene encoding.','TRAINING_RESULT_INVALID');}
  outputs.push({body,mime:'application/octet-stream',suffix:row.quality_report.tier+'.splat',quality:{...row.quality_report,kind:'splat_viewer_tier',sourceArtifactId:row.id,encoding:'splat32-wxyz-v1',reviewRequired:true,publiclyServed:false}});
 }
 return persist(a,engine,r,asset,outputs,false,async c=>{if(JSON.stringify(await current(c))!==JSON.stringify(context))fail(409,'Scene export authority changed.','TRAINING_INPUT_CHANGED');});
}
