import {recordProcessingOutcome} from './processing-metrics.js';
import {skipTerminalDependents,finalizePrivateProcessingRun} from './run-finalization.js';
import {createHash} from 'node:crypto';
import {GetObjectCommand,PutObjectCommand} from '@aws-sdk/client-s3';
import sharp from 'sharp';
import {z} from 'zod';
import {event,type Actor} from '@haven/database';
import {fail,transaction} from '../../platform/core.js';
import {completeProcessingStage} from './stage-completion.js';
import {checkedWorkspace,requireDigitizationAgency} from './intakes.js';
import {cpuSourceFingerprint,prepareCpuExecution} from './execution-scope.js';
import {verifySmallDigitizationSource} from './source-validation.js';
import {captureStorage} from './multipart.js';
import type {CpuRunnerClient} from './runner-client.js';
import type pg from 'pg';
import {beginOutputWrite,finishOutputWrite} from './output-writes.js';
import {collectNativeDocumentFacts,collectDocumentOcr} from './native-fact-results.js';
import {cameraProfile,currentCameraInput} from './camera-input.js';
import {collectCameraResult} from './camera-results.js';

import {gsplatExportProfile,isGsplatTrainingProfile} from './training-configuration.js';
import {currentTrainingInput} from './training-input.js';
import {collectTrainingExecution,collectSceneExport} from './training-results.js';

const checksum=z.string().regex(/^[a-f0-9]{64}$/);
const preview=z.object({sha256:checksum,width:z.number().int().positive().max(30000000),height:z.number().int().positive().max(30000000),coordinateSpace:z.literal('upright-page-normalized-top-left'),originalToUpright:z.array(z.number().finite()).length(9)});
const pdfPage=preview.extend({page:z.number().int().positive().max(50),requiresOcr:z.boolean(),processingProfile:z.literal('pdfium-150dpi-v1'),softwareVersions:z.strictObject({pypdfium2:z.literal('5.14.0'),pypdf:z.literal('6.1.1'),pdfium:z.literal('156.0.8076.0')})});
const isolatedResult=z.object({ocrAvailable:z.literal(false),isolation:z.object({profile:z.literal('linux-landlock-seccomp-decoder-v1'),landlockAbi:z.number().int().min(6)})});

/** Accept only checksum-bound private renders. Native text/candidates, provider
 * paths and diagnostics never enter the artifact manifest or outbox payload.
 */
export async function existingRenderReceipt(c:pg.PoolClient,a:Actor,engine:string,stageId:string,executionId:string,fencingToken:string,assetId:string){
  await requireDigitizationAgency(c,a);const workspace=await checkedWorkspace(c,engine);
  const stage=(await c.query('SELECT s.*,r.created_by AS run_creator FROM processing_stages s JOIN processing_runs r ON r.id=s.run_id WHERE s.id=$1 AND s.digitization_id=$2 FOR UPDATE OF s,r',[stageId,engine])).rows[0];
  if(!stage)fail(404,'Processing stage not found.');
  if(stage.run_creator!==a.id)fail(403,'This result requires its initiating actor.','EXECUTION_SCOPE_REQUIRED');
  if(workspace.state!=='active'||stage.input_revision!==workspace.inputRevision)fail(409,'The source revision changed.','INPUT_REVISION_CONFLICT');
  if(stage.execution_id!==executionId||String(stage.fencing_token)!==fencingToken)fail(409,'The execution was replaced.','STALE_EXECUTION');
  if(stage.state!=='succeeded')return null;
  const source=(isGsplatTrainingProfile(stage.profile_id)||stage.profile_id===gsplatExportProfile)?(await currentTrainingInput(c,a,engine,stage,assetId)).source:stage.profile_id===cameraProfile?(await currentCameraInput(c,a,engine,stage,assetId)).source:(await c.query('SELECT source_set FROM property_input_revisions WHERE digitization_id=$1 AND revision=$2',[engine,stage.input_revision])).rows[0]?.source_set?.find((s:any)=>s.assetId===assetId);
  if(!source||!(await c.query("SELECT digitization_asset_access($1,$2,$3,$4,'document_processing') allowed",[engine,assetId,source.assetVersion,stage.input_revision])).rows[0].allowed)fail(403,'Current evidence processing authority is required.','SOURCE_ACCESS_CHANGED');
  if(cpuSourceFingerprint(engine,a.orgId!,stage.input_revision,stage.profile_id,source)!==stage.input_fingerprint)fail(409,'The completed execution used a different source.','INPUT_FINGERPRINT_CONFLICT');
  const artifacts=(await c.query('SELECT id FROM artifacts WHERE stage_id=$1 ORDER BY id',[stageId])).rows;
  if(!artifacts.length)fail(409,'The completed stage has no render receipt.','RESULT_RECEIPT_MISSING');
  return {executionId,state:'succeeded' as const,artifactIds:artifacts.map(row=>row.id)};
}
export function completedCpuRenderReceipt(a:Actor,engine:string,stageId:string,executionId:string,fencingToken:string,assetId:string){
 return transaction(a,c=>existingRenderReceipt(c,a,engine,stageId,executionId,fencingToken,assetId));
}
export async function collectCpuRenders(a:Actor,engine:string,stageId:string,executionId:string,fencingToken:string,assetId:string,client:CpuRunnerClient):Promise<{executionId:string;state:'succeeded';artifactIds:string[]}>{
 const prior=await completedCpuRenderReceipt(a,engine,stageId,executionId,fencingToken,assetId);
 if(prior){
  const type=await transaction(a,async c=>(await c.query("SELECT stage_type FROM processing_stages WHERE id=$1 AND digitization_id=$2",[stageId,engine])).rows[0]?.stage_type);
  if(type==='fact_extract')await collectNativeDocumentFacts(a,engine,stageId,executionId,fencingToken,assetId,client);
  if(type==='document_ocr')await collectDocumentOcr(a,engine,stageId,executionId,fencingToken,assetId,client);
  return prior;
 }
 const request=await transaction(a,c=>prepareCpuExecution(c,a,engine,stageId,executionId,fencingToken,assetId));
 if(isGsplatTrainingProfile(request.profileId))return collectTrainingExecution(a,engine,request,assetId,client);
 if(request.profileId===gsplatExportProfile)return collectSceneExport(a,engine,request,assetId);
 if(!['document_rasterize','document_ocr','media_probe','panorama_optimize','frame_select','fact_extract','camera_solve'].includes(request.stageType))fail(422,'This command accepts private CPU results only.','RESULT_PROFILE_UNAVAILABLE');
 const receipt=await client.read(request);
 if(['failed_terminal','failed_retryable','cancelled'].includes(receipt.state)){
  const state=receipt.state==='failed_retryable'?'failed_retryable':'failed_terminal';
  const mediaErrors:Record<string,string>={MEDIA_CODEC_UNSUPPORTED:'This clip uses an unsupported codec. Upload a tested H.264, HEVC, VP8 or VP9 clip.',MEDIA_ORIENTATION_CONFLICT:'This clip has an ambiguous orientation. Export an upright clip and upload it again.',MEDIA_DISPLAY_TRANSFORM_UNSUPPORTED:'This clip uses an unsupported display transform. Export an upright clip and upload it again.',MEDIA_DURATION_BUDGET_EXCEEDED:'This clip exceeds the supported ten-minute duration.',MEDIA_DIMENSION_BUDGET_EXCEEDED:'This clip exceeds the supported 4096-pixel dimensions.'};
  const mediaCode=['media_probe','frame_select'].includes(request.stageType)&&typeof receipt.errorCode==='string'&&mediaErrors[receipt.errorCode]?receipt.errorCode:null;
  await transaction(a,async c=>{
   await prepareCpuExecution(c,a,engine,stageId,executionId,fencingToken,assetId);
   await c.query('UPDATE processing_stages SET state=$2,error_code=$3,version=version+1 WHERE id=$1',[stageId,state,mediaCode??(state==='failed_retryable'?'CPU_RUNNER_INTERRUPTED':'CPU_SOURCE_REJECTED')]);
   await recordProcessingOutcome(c,a,engine,stageId,executionId,fencingToken);
   if(state==='failed_terminal'){await skipTerminalDependents(c,engine,request.runId,stageId);await finalizePrivateProcessingRun(c,engine,request.runId);}
   await c.query("INSERT INTO digitization_events(digitization_id,organization_id,created_by,run_id,kind,state) VALUES($1,$2,$3,$4,'digitization.stage_failed',$5)",[engine,a.orgId,a.id,request.runId,state]);
   await event(c,a,engine,'digitization.stage_failed',{runId:request.runId,stageId,executionId,state});
  });
  if(mediaCode)fail(422,mediaErrors[mediaCode],mediaCode);
  fail(state==='failed_retryable'?503:422,'The bounded decoder could not complete this source.',state==='failed_retryable'?'CPU_RUNNER_INTERRUPTED':'CPU_SOURCE_REJECTED');
 }
 if(receipt.state!=='succeeded')fail(409,'The decoder has not completed successfully.','RESULT_NOT_READY');
 if(request.profileId===cameraProfile)return collectCameraResult(a,engine,request,assetId,receipt.result,client);
 if(['fact_extract','document_ocr'].includes(request.stageType)){
  const collect=request.stageType==='document_ocr'?collectDocumentOcr:collectNativeDocumentFacts;
  const {executionId:collectedExecution,state,artifactIds}=await collect(a,engine,stageId,executionId,fencingToken,assetId,client);
  // Keep the existing coordinator transport contract; candidate identity and
  // quoted private values belong only to the guarded document review port.
  return {executionId:collectedExecution,state,artifactIds};
 }
 let mediaMetadata:Record<string,unknown>|null=null;
 let derivativeKind='media_thumbnail';
 let pages:Array<z.infer<typeof preview>&{page:number;requiresOcr:boolean;softwareVersions:Record<string,string>;frameMetadata?:Record<string,unknown>}>;
 try{
  if(request.profileId==='pdfium-150dpi-v1')pages=isolatedResult.extend({pages:z.array(pdfPage).min(1).max(50)}).parse(receipt.result).pages;
  else if(request.profileId==='upright-image-v1'){
   const image=isolatedResult.extend({image:preview}).parse(receipt.result).image;
   pages=[{...image,page:1,requiresOcr:true,softwareVersions:{Pillow:'11.3.0',profile:'upright-image-v1'}}];
  }else if(request.profileId==='private-photo-frame-v1'&&request.stageType==='frame_select'){
   const image=isolatedResult.extend({image:preview}).parse(receipt.result).image;
   if(image.width>1600||image.height>1600)throw Error('Photo frame exceeds its bounded profile');
   derivativeKind='photo_frame';mediaMetadata={timestampSeconds:'0',timestampBasis:'still_image_no_timestamp',locationMetadataRetained:false,reviewRequired:true};
   pages=[{...image,page:1,requiresOcr:false,softwareVersions:{Pillow:'11.3.0',profile:'private-photo-frame-v1'}}];
  }else if(request.profileId==='ffmpeg715-minimal-media-v1'&&request.stageType==='media_probe'){
   const media=z.strictObject({codec:z.enum(['h264','hevc','vp8','vp9']),durationSeconds:z.number().finite().positive().max(600),encodedWidth:z.number().int().min(64).max(4096),encodedHeight:z.number().int().min(64).max(4096),displayRotationDegrees:z.union([z.literal(0),z.literal(90),z.literal(180),z.literal(270)]),orientationBasis:z.enum(['container_display_matrix','no_rotation_metadata']),uprightWidth:z.number().int().min(64).max(4096),uprightHeight:z.number().int().min(64).max(4096),locationMetadataRetained:z.literal(false),reviewRequired:z.literal(true),processingProfile:z.literal('ffmpeg715-minimal-media-v1'),isolationProfile:z.literal('linux-landlock-seccomp-media-v1'),thumbnail:z.strictObject({filename:z.string().regex(/^page-001-[a-f0-9]{64}\.png$/),sha256:checksum,byteSize:z.string().regex(/^[1-9]\d{0,8}$/),width:z.number().int().positive().max(640),height:z.number().int().positive().max(640),mime:z.literal('image/png')})}).parse(receipt.result);
   const rotated=[90,270].includes(media.displayRotationDegrees);
   if(media.uprightWidth!==(rotated?media.encodedHeight:media.encodedWidth)||media.uprightHeight!==(rotated?media.encodedWidth:media.encodedHeight)||Math.abs(media.thumbnail.width/media.thumbnail.height-media.uprightWidth/media.uprightHeight)>.02)throw Error('Invalid upright media dimensions');
   const {thumbnail,processingProfile:_profile,isolationProfile:_isolation,...metadata}=media;mediaMetadata=metadata;
   // Page index names an internal derivative only; no plan transform is persisted for video.
   pages=[{sha256:thumbnail.sha256,width:thumbnail.width,height:thumbnail.height,coordinateSpace:'upright-page-normalized-top-left',originalToUpright:[1,0,0,0,1,0,0,0,1],page:1,requiresOcr:false,softwareVersions:{ffmpeg:'7.1.5',Pillow:'11.3.0',profile:'ffmpeg715-minimal-media-v1'}}];
  }else if(request.profileId==='private-panorama-candidate-v1'&&request.stageType==='panorama_optimize'){
   const panorama=isolatedResult.extend({projection:z.literal('equirectangular_candidate'),projectionBasis:z.literal('dimensions_only'),genuinePanoramaConfirmed:z.literal(false),reviewRequired:z.literal(true),reviewReason:z.literal('Capture provenance and spherical projection require review; a 2:1 photo is insufficient.'),sourceWidth:z.number().int().min(1024).max(30000),sourceHeight:z.number().int().positive().max(15000),sourceOrientation:z.union([z.literal(1),z.literal(3)]),locationMetadataRetained:z.literal(false),processingProfile:z.literal('private-panorama-candidate-v1'),tiers:z.array(z.strictObject({width:z.union([z.literal(1024),z.literal(2048),z.literal(4096)]),height:z.number().int().positive().max(2048),sha256:checksum,byteSize:z.number().int().positive().max(32*1024*1024),filename:z.string().regex(/^panorama-(1024|2048|4096)-[a-f0-9]{64}\.png$/)})).min(1).max(3)}).parse(receipt.result);
   if(panorama.sourceWidth!==2*panorama.sourceHeight||panorama.sourceWidth*panorama.sourceHeight>30000000)throw Error('Invalid panorama bounds');
   const expected=[1024,2048,4096].filter(width=>width<=panorama.sourceWidth);
   if(panorama.tiers.length!==expected.length||panorama.tiers.some((tier,index)=>tier.width!==expected[index]||tier.height!==tier.width/2||tier.filename!==`panorama-${tier.width}-${tier.sha256}.png`))throw Error('Invalid panorama tiers');
   const {tiers,processingProfile:_profile,isolation:_isolation,ocrAvailable:_ocr,...metadata}=panorama;mediaMetadata=metadata;derivativeKind='panorama_candidate';
   pages=tiers.map((tier,index)=>({sha256:tier.sha256,width:tier.width,height:tier.height,coordinateSpace:'upright-page-normalized-top-left',originalToUpright:[1,0,0,0,1,0,0,0,1],page:index+1,requiresOcr:false,softwareVersions:{Pillow:'11.3.0',profile:'private-panorama-candidate-v1'}}));
  }else if(request.profileId==='private-media-frames-v1'&&request.stageType==='frame_select'){
   const seconds=z.string().regex(/^[0-9]{1,3}(?:\.[0-9]{1,9})?(?:[eE][+-]?[0-9]{1,3})?$/).refine(value=>Number.isFinite(Number(value))&&Number(value)>=0&&Number(value)<=601);
   const text=z.string().min(1).max(128).refine(value=>Array.from(value).every(character=>character.charCodeAt(0)>31&&character.charCodeAt(0)!==127)).nullable();
   const frames=z.strictObject({codec:z.enum(['h264','hevc','vp8','vp9']),durationSeconds:z.number().finite().positive().max(600),encodedWidth:z.number().int().min(64).max(4096),encodedHeight:z.number().int().min(64).max(4096),displayRotationDegrees:z.union([z.literal(0),z.literal(90),z.literal(180),z.literal(270)]),orientationBasis:z.enum(['container_display_matrix','no_rotation_metadata']),uprightWidth:z.number().int().min(64).max(4096),uprightHeight:z.number().int().min(64).max(4096),locationMetadataRetained:z.literal(false),reviewRequired:z.literal(true),camera:z.strictObject({make:text,model:text,lensModel:text,focalLengthMm:z.string().regex(/^[0-9]{1,4}(?:\.[0-9]{1,6})?$/).refine(value=>Number(value)>0&&Number(value)<=10000).nullable(),intrinsics:z.null(),basis:z.literal('container_tags_unverified')}),samplingProfile:z.literal('decoded-select-one-fps-v1'),processingProfile:z.literal('private-media-frames-v1'),isolationProfile:z.literal('linux-landlock-seccomp-media-v1'),frames:z.array(z.strictObject({index:z.number().int().positive().max(600),timestampSeconds:seconds,presentationTimestamp:z.string().regex(/^-?[0-9]{1,15}$/),timeBase:z.string().regex(/^[1-9][0-9]{0,9}\/[1-9][0-9]{0,9}$/),timestampBasis:z.literal('decoded_input_pts'),sha256:checksum,byteSize:z.number().int().positive().max(16*1024*1024),width:z.number().int().positive().max(1600),height:z.number().int().positive().max(1600),previewFilename:z.string().regex(/^page-001-[a-f0-9]{64}\.png$/)})).min(1).max(600)}).parse(receipt.result);
   const rotated=[90,270].includes(frames.displayRotationDegrees);
   if(frames.uprightWidth!==(rotated?frames.encodedHeight:frames.encodedWidth)||frames.uprightHeight!==(rotated?frames.encodedWidth:frames.encodedHeight))throw Error('Invalid frame orientation');
   for(const [index,frame] of frames.frames.entries()){
    const [n,d]=frame.timeBase.split('/').map(Number),pts=Number(frame.presentationTimestamp),timestamp=Number(frame.timestampSeconds);
    if(n>1000000000||d>1000000000||!Number.isSafeInteger(pts)||frame.index!==index+1||frame.previewFilename!==`page-001-${frame.sha256}.png`||Math.abs(timestamp-pts*n/d)>.001||timestamp>frames.durationSeconds+1||index>0&&timestamp-Number(frames.frames[index-1].timestampSeconds)<.999||Math.abs(frame.width/frame.height-frames.uprightWidth/frames.uprightHeight)>.02)throw Error('Invalid decoded frame provenance');
   }
   const {frames:outputs,processingProfile:_profile,isolationProfile:_isolation,...metadata}=frames;mediaMetadata=metadata;derivativeKind='video_frame';
   pages=outputs.map(frame=>({sha256:frame.sha256,width:frame.width,height:frame.height,coordinateSpace:'upright-page-normalized-top-left',originalToUpright:[1,0,0,0,1,0,0,0,1],page:frame.index,requiresOcr:false,softwareVersions:{ffmpeg:'7.1.5',Pillow:'11.3.0',profile:'private-media-frames-v1'},frameMetadata:{frameIndex:frame.index,timestampSeconds:frame.timestampSeconds,presentationTimestamp:frame.presentationTimestamp,timeBase:frame.timeBase,timestampBasis:frame.timestampBasis}}));
  }else throw Error('Unsupported profile');
  if(pages.some((page,index)=>page.page!==index+1)||pages.reduce((sum,page)=>sum+page.width*page.height,0)>30000000)throw Error('Invalid raster budget');
  for(const {originalToUpright:m} of pages)if(m[6]!==0||m[7]!==0||m[8]!==1||Math.abs(m[0]*m[4]-m[1]*m[3])<1e-12)throw Error('Invalid upright transform');
 }catch{fail(422,'The decoder result does not match its approved profile.','RESULT_INVALID');}
 // Recheck actual immutable source bytes before accepting a stored decoder result.
 const binding=await transaction(a,async c=>{
  await prepareCpuExecution(c,a,engine,stageId,executionId,fencingToken,assetId);
  return (await c.query('SELECT asset_version,purpose FROM digitization_asset_bindings WHERE digitization_id=$1 AND input_revision=$2 AND asset_id=$3',[engine,request.inputRevision,assetId])).rows[0];
 });
 if(!binding)fail(404,'Current processing source not found.','SOURCE_NOT_FOUND');
 const source=await verifySmallDigitizationSource(a,engine,assetId,binding.asset_version,request.inputRevision,binding.purpose);
 if(source.sha256!==request.artifacts[0].checksum)fail(409,'Stored source changed after its input snapshot.','SOURCE_CONTENT_CHANGED');
 const writer=await beginOutputWrite(a,engine,stageId,executionId,fencingToken,assetId);
 if(!writer)return collectCpuRenders(a,engine,stageId,executionId,fencingToken,assetId,client);
 const storage=captureStorage(),renders:Array<{page:typeof pages[number];objectKey:string;bytes:number}>=[];let total=0;
 try{
  for(const page of pages){
   writer.signal.throwIfAborted();
   const body=await client.preview(request,page.sha256);total+=body.length;
   if(total>(derivativeKind==='video_frame'?64:32)*1024*1024)fail(422,'The decoder output exceeds its byte budget.','RESULT_BUDGET_EXCEEDED');
   const metadata=await sharp(body,{limitInputPixels:30000000,failOn:'warning'}).metadata();
   if(metadata.format!=='png'||metadata.width!==page.width||metadata.height!==page.height)fail(422,'The private preview dimensions do not match.','RESULT_INVALID');
   const objectKey=`digitization/${engine}/${request.runId}/${stageId}/${executionId}/${page.page}-${page.sha256}.png`;
   // Conditional creation plus content verification supports lost DB commit recovery.
   try{await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:objectKey,Body:body,ContentType:'image/png',IfNoneMatch:'*'}),{abortSignal:AbortSignal.any([writer.signal,AbortSignal.timeout(20000)])});}
   catch(error:any){if(error.$metadata?.httpStatusCode!==412)throw error;}
   const stored=await storage.send(new GetObjectCommand({Bucket:'haven-private',Key:objectKey}),{abortSignal:AbortSignal.any([writer.signal,AbortSignal.timeout(20000)])});
   if(!stored.Body||stored.ContentLength!==body.length){(stored.Body as any)?.destroy?.();fail(422,'Private render storage does not match.','RESULT_OBJECT_MISMATCH');}
   const hash=createHash('sha256');let size=0;
   for await(const chunk of stored.Body as AsyncIterable<Uint8Array>){size+=chunk.byteLength;if(size>body.length){(stored.Body as any).destroy?.();fail(422,'Private render storage does not match.','RESULT_OBJECT_MISMATCH');}hash.update(chunk);}
   if(size!==body.length||hash.digest('hex')!==page.sha256)fail(422,'Private render storage does not match.','RESULT_OBJECT_MISMATCH');
   renders.push({page,objectKey,bytes:body.length});
  }
  return await transaction(a,async c=>{
   const completed=await existingRenderReceipt(c,a,engine,stageId,executionId,fencingToken,assetId);
   if(completed)return completed;
   await prepareCpuExecution(c,a,engine,stageId,executionId,fencingToken,assetId);
   const artifactIds=[];
   for(const {page,objectKey,bytes} of renders){
    const artifact=(await c.query(`INSERT INTO artifacts(digitization_id,organization_id,created_by,run_id,stage_id,input_revision,input_fingerprint,object_key,checksum,byte_size,format,profile_id,software_versions,quality_report) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'image/png',$11,$12,$13) RETURNING id`,[engine,a.orgId,a.id,request.runId,stageId,request.inputRevision,request.inputFingerprint,objectKey,page.sha256,String(bytes),request.profileId,page.softwareVersions,mediaMetadata?{kind:derivativeKind,width:page.width,height:page.height,...mediaMetadata,...page.frameMetadata}:{page:page.page,width:page.width,height:page.height,coordinateSpace:page.coordinateSpace,originalToUpright:page.originalToUpright,requiresOcr:page.requiresOcr}])).rows[0];
    artifactIds.push(artifact.id);
   }
   await completeProcessingStage(c,a,engine,request.runId,stageId,executionId,fencingToken);
   return {executionId,state:'succeeded' as const,artifactIds:artifactIds.sort()};
  });
 }finally{storage.destroy();await finishOutputWrite(a,writer);}
}
