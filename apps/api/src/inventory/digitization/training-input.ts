import {randomUUID} from 'node:crypto';
import type pg from 'pg';
import type {Actor} from '@haven/database';
import {digitizationCameraResult,digitizationTrainingCreate} from '@haven/contracts';
import type {z} from 'zod';
import {fail} from '../../platform/core.js';
import {checkedWorkspace,readWorkspace,requireDigitizationAgency} from './intakes.js';
import {currentCameraInput} from './camera-input.js';
import {cpuSourceFingerprint} from './execution-scope.js';
import {createRunGraph,dispatchRunGraph} from './workflow.js';
import {gsplatTrainingProfile,gsplatExportProfile,trainingAvailable} from './training-configuration.js';
type Input=z.infer<typeof digitizationTrainingCreate>;
export async function trainingContext(c:pg.PoolClient,a:Actor,engine:string,x:Input,lockWorkspace=true){
 await requireDigitizationAgency(c,a);const w=await (lockWorkspace?checkedWorkspace:readWorkspace)(c,engine);
 if(w.state!=='active'||w.version!==x.workspaceVersion||w.inputRevision!==x.inputRevision)fail(409,'The property sources changed. Reload before scene training.','INPUT_REVISION_CONFLICT');
 const r=(await c.query(`SELECT ar.*,s.input_fingerprint FROM artifacts ar JOIN processing_stages s ON s.id=ar.stage_id WHERE ar.id=$1 AND ar.digitization_id=$2 AND ar.input_revision=$3 AND ar.status='private' AND ar.privacy_status IN('pending','passed') AND ar.quality_report->>'kind'='camera_solve_report' AND s.state='succeeded'`,[x.cameraReportId,engine,x.inputRevision])).rows[0];
 if(!r)fail(404,'Current private calibrated camera result not found.');
 const camera=await currentCameraInput(c,a,engine,{id:r.stage_id,input_revision:r.input_revision,input_fingerprint:r.input_fingerprint},undefined,lockWorkspace),result=digitizationCameraResult.parse(r.quality_report);
 if(camera.workspace_version!==w.version||!result.trainingArchive)fail(422,'Recover usable calibrated views before scene training.','TRAINING_INPUT_REQUIRED');
 const archive=(await c.query(`SELECT id,version,checksum,byte_size::text,object_key FROM artifacts WHERE stage_id=$1 AND digitization_id=$2 AND status='private' AND privacy_status IN('pending','passed') AND format='application/x-tar' AND quality_report->>'kind'='camera_training_archive'`,[r.stage_id,engine])).rows;
 if(archive.length!==1||archive[0].checksum!==result.trainingArchive.sha256||archive[0].byte_size!==result.trainingArchive.byteSize)fail(409,'The calibrated training archive changed.','TRAINING_INPUT_CHANGED');
 const source={...camera.source,sha256:archive[0].checksum,bytes:archive[0].byte_size,decoderState:'calibrated_training_prepared'};
 return {workspace:w,archive:archive[0],source,datasetFingerprint:result.trainingArchive.datasetFingerprint,captureCameras:result.report.trainingInput?.cameras??null};
}
export async function currentTrainingInput(c:pg.PoolClient,a:Actor,engine:string,stage:any,assetId?:string,lockWorkspace=true){
 const input=(await c.query('SELECT * FROM digitization_training_inputs WHERE (stage_id=$1 OR export_stage_id=$1) AND digitization_id=$2',[stage.id,engine])).rows[0];
 if(!input||input.created_by!==a.id||input.input_revision!==stage.input_revision||assetId&&input.source.assetId!==assetId)fail(404,'Current private training input not found.');
 const fresh=await trainingContext(c,a,engine,{workspaceVersion:input.workspace_version,inputRevision:input.input_revision,cameraReportId:input.camera_report_id},lockWorkspace);
 if(input.archive_id!==fresh.archive.id||input.dataset_fingerprint!==fresh.datasetFingerprint||Object.keys(fresh.source).some(key=>input.source[key]!==fresh.source[key])||Object.keys(input.source).length!==Object.keys(fresh.source).length)fail(409,'Training source authority changed.','TRAINING_INPUT_CHANGED');
 const profile=stage.id===input.stage_id?(await c.query('SELECT profile_id FROM processing_stages WHERE id=$1',[stage.id])).rows[0]?.profile_id:gsplatExportProfile;
 if(cpuSourceFingerprint(engine,a.orgId!,stage.input_revision,profile,input.source)!==stage.input_fingerprint)fail(409,'The training input fingerprint changed.','INPUT_FINGERPRINT_CONFLICT');
 return {...input,archive:fresh.archive,captureCameras:fresh.captureCameras};
}
export async function startTrainingProcessing(c:pg.PoolClient,a:Actor,engine:string,x:Input){
 const context=await trainingContext(c,a,engine,x);
 if(!trainingAvailable())fail(422,'Scene training is disabled pending GPU validation.','GPU_TRAINING_UNAVAILABLE');
 const fingerprint=cpuSourceFingerprint(engine,a.orgId!,x.inputRevision,gsplatTrainingProfile,context.source);
 if((await c.query("SELECT 1 FROM processing_stages s JOIN processing_runs r ON r.id=s.run_id WHERE s.digitization_id=$1 AND s.input_fingerprint=$2 AND r.state IN('draft','queued','running','cancel_requested')",[engine,fingerprint])).rowCount)fail(409,'These calibrated views already have an active training job.','PROCESSING_ALREADY_ACTIVE');
 const runId=randomUUID(),stageId=randomUUID(),exportId=randomUUID();
 await createRunGraph(c,a,engine,x.workspaceVersion,{schemaVersion:1,id:runId,organizationId:a.orgId!,creatorId:a.id,target:context.workspace.target,inputRevision:x.inputRevision,state:'draft',version:1,stages:[{id:stageId,type:'splat_train' as const,profileId:gsplatTrainingProfile,dependencies:[],inputFingerprint:fingerprint},{id:exportId,type:'scene_export' as const,profileId:gsplatExportProfile,dependencies:[stageId],inputFingerprint:cpuSourceFingerprint(engine,a.orgId!,x.inputRevision,gsplatExportProfile,context.source)}].map(s=>({...s,state:'pending' as const,inputRevision:x.inputRevision,attempt:0,fencingToken:null,executionId:null,progress:null})),deadline:new Date(Date.now()+2400000).toISOString(),budget:{maxSeconds:1440,maxScratchBytes:'2147483648'}},['scene']);
 await c.query('INSERT INTO digitization_training_inputs(stage_id,export_stage_id,digitization_id,organization_id,created_by,input_revision,workspace_version,camera_report_id,archive_id,dataset_fingerprint,source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[stageId,exportId,engine,a.orgId,a.id,x.inputRevision,x.workspaceVersion,x.cameraReportId,context.archive.id,context.datasetFingerprint,context.source]);
 return {...await dispatchRunGraph(c,a,engine,runId,1),inputRevision:x.inputRevision};
}
