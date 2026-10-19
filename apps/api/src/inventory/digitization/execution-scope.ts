import {createHash} from 'node:crypto';
import type pg from 'pg';
import type {Actor} from '@haven/database';
import {digitizationExecutionRequest} from '@haven/contracts';
import {fail} from '../../platform/core.js';
import {requireCurrentExecution} from './leases.js';
import {documentOcrProfileAllowed} from './ocr-configuration.js';
import {cameraAvailable,cameraProfile,currentCameraInput} from './camera-input.js';

import {gsplatExportProfile,isGsplatTrainingProfile,trainingAvailable} from './training-configuration.js';
import {currentTrainingInput} from './training-input.js';

type SourceSnapshot={assetId:string;assetVersion:number;purpose:string;sha256:string;bytes:string;detectedMime:string;decoderState:string};
const profiles:Record<string,{stage:string;mime:readonly string[]}>= {
 'pdfium-150dpi-v1':{stage:'document_rasterize',mime:['application/pdf']},
 'upright-image-v1':{stage:'document_rasterize',mime:['image/jpeg','image/png']},
 'ffmpeg715-minimal-media-v1':{stage:'media_probe',mime:['video/mp4','video/quicktime','video/webm']},
 'private-panorama-candidate-v1':{stage:'panorama_optimize',mime:['image/jpeg','image/png']},
 'private-photo-frame-v1':{stage:'frame_select',mime:['image/jpeg','image/png']},
 'private-media-frames-v1':{stage:'frame_select',mime:['video/mp4','video/quicktime','video/webm']},
 ...Object.fromEntries(['en','fr','ar'].flatMap(locale=>['v1','v3'].map(version=>['generic-native-facts-'+locale+'-'+version,{stage:'fact_extract',mime:['application/pdf']}])) )
};
function executionProfile(id:string){
 if((isGsplatTrainingProfile(id)||id===gsplatExportProfile)&&trainingAvailable())return {stage:isGsplatTrainingProfile(id)?'splat_train':'scene_export',mime:['application/x-tar']};
 if(id===cameraProfile&&cameraAvailable())return {stage:'camera_solve',mime:['application/x-tar']};
 if(/^private-ocr-document-/.test(id)&&documentOcrProfileAllowed(id))return {stage:'document_ocr',mime:['application/pdf']};
 if(/^private-ocr-image-/.test(id)&&documentOcrProfileAllowed(id))return {stage:'document_ocr',mime:['image/jpeg','image/png']};
 return profiles[id];
}
/** Server-prepared stage fingerprint: scope and immutable content/configuration,
 * independent of attempts/leases. No cross-workspace content reuse.
 */
export function cpuSourceFingerprint(engine:string,organizationId:string,inputRevision:number,profileId:string,source:SourceSnapshot){
 return createHash('sha256').update(JSON.stringify({version:1,engine,organizationId,inputRevision,profileId,source:{assetId:source.assetId,assetVersion:source.assetVersion,purpose:source.purpose,sha256:source.sha256,bytes:source.bytes,detectedMime:source.detectedMime,decoderState:source.decoderState}})).digest('hex');
}
/** Short transaction only. Call again after source transfer before any commit.
 * Storage transfer and HMAC issuance happen outside SQL; this port returns no key.
 */
export async function prepareCpuExecution(c:pg.PoolClient,a:Actor,engine:string,stageId:string,executionId:string,fencingToken:string,assetId:string){
 const stage=await requireCurrentExecution(c,a,engine,stageId,executionId,fencingToken);
 if(stage.profile_id===cameraProfile){if(!cameraAvailable())fail(422,'CPU camera reconstruction is unavailable.','PROFILE_UNAVAILABLE');const input=await currentCameraInput(c,a,engine,stage,assetId);return buildCpuExecutionRequest(a,engine,stageId,executionId,fencingToken,stage,input.source);}
 if((isGsplatTrainingProfile(stage.profile_id)||stage.profile_id===gsplatExportProfile)){if(!trainingAvailable())fail(422,'Scene training is unavailable.','GPU_TRAINING_UNAVAILABLE');const input=await currentTrainingInput(c,a,engine,stage,assetId);return buildCpuExecutionRequest(a,engine,stageId,executionId,fencingToken,stage,input.source);}
 const profile=executionProfile(stage.profile_id);
 if(!profile||profile.stage!==stage.stage_type)fail(422,'This processing profile is unavailable.','PROFILE_UNAVAILABLE');
 const snapshot=(await c.query('SELECT source_set FROM property_input_revisions WHERE digitization_id=$1 AND revision=$2',[engine,stage.input_revision])).rows[0];
 const matches=(snapshot?.source_set??[]).filter((item:SourceSnapshot)=>item.assetId===assetId) as SourceSnapshot[];
 if(matches.length>1)fail(422,'Select an unambiguous source binding for this execution.','SOURCE_SELECTION_AMBIGUOUS');
 const source=matches[0];
 if(!source||['fact_extract','document_ocr'].includes(stage.stage_type)&&source.purpose!=='document'||!(stage.profile_id==='private-photo-frame-v1'?source.purpose==='photo':['media_probe','frame_select'].includes(stage.stage_type)?source.purpose==='video':stage.stage_type==='panorama_optimize'?source.purpose==='panorama':['document','plan'].includes(source.purpose))||!profile.mime.includes(source.detectedMime))fail(404,'Current processing source not found.','SOURCE_NOT_FOUND');
 if(cpuSourceFingerprint(engine,a.orgId!,stage.input_revision,stage.profile_id,source)!==stage.input_fingerprint)fail(409,'The execution inputs or profile changed.','INPUT_FINGERPRINT_CONFLICT');
 if(!(await c.query("SELECT digitization_asset_access($1,$2,$3,$4,'document_processing') allowed",[engine,source.assetId,source.assetVersion,stage.input_revision])).rows[0].allowed)fail(403,'Current evidence processing authority is required.','SOURCE_ACCESS_CHANGED');
 return buildCpuExecutionRequest(a,engine,stageId,executionId,fencingToken,stage,source);
}
/** Trusted metadata only; callers separately authorize execution or cancellation.
 * A cancellation command never receives source bytes or a read capability.
 */
export function buildCpuExecutionRequest(a:Actor,engine:string,stageId:string,executionId:string,fencingToken:string,stage:any,source:SourceSnapshot){
 const profile=(isGsplatTrainingProfile(stage.profile_id)||stage.profile_id===gsplatExportProfile)?{stage:isGsplatTrainingProfile(stage.profile_id)?'splat_train':'scene_export',mime:['application/x-tar']}:stage.profile_id===cameraProfile?{stage:'camera_solve',mime:['application/x-tar']}:executionProfile(stage.profile_id);
 if(!profile||profile.stage!==stage.stage_type||!profile.mime.includes(source.detectedMime))fail(422,'This processing profile is unavailable.','PROFILE_UNAVAILABLE');
 if(cpuSourceFingerprint(engine,a.orgId!,stage.input_revision,stage.profile_id,source)!==stage.input_fingerprint)fail(409,'The execution inputs or profile changed.','INPUT_FINGERPRINT_CONFLICT');
 const budget=stage.run_budget;
 if(!Number.isSafeInteger(budget.maxSeconds)||budget.maxSeconds<1||typeof budget.maxScratchBytes!=='string'||!/^\d{1,13}$/.test(budget.maxScratchBytes)||Number(budget.maxScratchBytes)<Number(source.bytes)+32*1024*1024)fail(422,'The run budget cannot support source decoding.','EXECUTION_BUDGET_INVALID');
 return digitizationExecutionRequest.parse({schemaVersion:1,executionId,organizationId:a.orgId,runId:stage.run_id,stageId,stageType:stage.stage_type,profileId:stage.profile_id,inputRevision:stage.input_revision,inputFingerprint:stage.input_fingerprint,fencingToken,artifacts:[{id:source.assetId,checksum:source.sha256,byteSize:source.bytes,detectedMime:source.detectedMime}],deadline:new Date(stage.deadline).toISOString(),budget:{maxSeconds:Math.min(stage.profile_id===cameraProfile||isGsplatTrainingProfile(stage.profile_id)?1200:stage.profile_id==='private-media-frames-v1'?60:15,budget.maxSeconds),maxScratchBytes:String(Math.min(((isGsplatTrainingProfile(stage.profile_id)||stage.profile_id===gsplatExportProfile)?2048:stage.profile_id===cameraProfile?2048:stage.profile_id==='private-media-frames-v1'?256:64)*1024*1024,Number(budget.maxScratchBytes)))}});
}
