import type pg from 'pg';
import type {Actor} from '@haven/database';
import {digitizationReconstructionStatus} from '@haven/contracts';
import {fail} from '../../platform/core.js';
import {readWorkspace,requireDigitizationAgency} from './intakes.js';
import {cameraAvailable,cameraProfile} from './camera-input.js';
import {latestCameraReview} from './camera-results.js';

import {trainingAvailable} from './training-configuration.js';
import {currentTrainingInput} from './training-input.js';

/** Resume status after navigation without resubmitting a job or exposing another
 * source revision's report. A newer failed/cancelled attempt supersedes old results. */
export async function readReconstructionStatus(c:pg.PoolClient,a:Actor,engine:string){
 await requireDigitizationAgency(c,a);const workspace=await readWorkspace(c,engine);
 if(workspace.state!=='active'||workspace.inputRevision>0&&!(await c.query("SELECT digitization_revision_access($1,$2,'document_processing') allowed",[engine,workspace.inputRevision])).rows[0].allowed)fail(403,'Current reconstruction source authority is required.','SOURCE_ACCESS_CHANGED');
 const cameraInput=(await c.query('SELECT stage_id FROM digitization_camera_inputs WHERE digitization_id=$1 AND input_revision=$2 AND workspace_version=$3 AND created_by=$4 ORDER BY created_at DESC,stage_id DESC LIMIT 1',[engine,workspace.inputRevision,workspace.version,a.id])).rows[0];
 const cameraStage=cameraInput?(await c.query('SELECT id,run_id,state AS stage_state,input_revision,input_fingerprint FROM processing_stages WHERE id=$1 AND digitization_id=$2 AND profile_id=$3',[cameraInput.stage_id,engine,cameraProfile])).rows[0]:null;
 const cameraRun=cameraStage?(await c.query('SELECT state FROM processing_runs WHERE id=$1 AND digitization_id=$2',[cameraStage.run_id,engine])).rows[0]:null;
 const stage=cameraRun?{...cameraStage,state:cameraRun.state}:null;
 const trainingInput=(await c.query('SELECT stage_id,export_stage_id FROM digitization_training_inputs WHERE digitization_id=$1 AND input_revision=$2 AND workspace_version=$3 AND created_by=$4 ORDER BY created_at DESC,stage_id DESC LIMIT 1',[engine,workspace.inputRevision,workspace.version,a.id])).rows[0];
 const training=trainingInput?(await c.query(`SELECT s.input_revision,s.input_fingerprint,r.id AS run_id,r.state,s.state AS training_state,e.state AS export_state FROM processing_stages s JOIN processing_stages e ON e.id=$3 AND e.digitization_id=$1 JOIN processing_runs r ON r.id=s.run_id AND r.digitization_id=$1 WHERE s.id=$2 AND s.digitization_id=$1`,[engine,trainingInput.stage_id,trainingInput.export_stage_id])).rows.map(row=>({...row,...trainingInput}))[0]:null;
 let camera=null;
 if(stage){
  // Active progress contains no artifact or frame data. Creator, current revision,
  // agency and live processing grants were checked above. Exact frame lineage is
  // revalidated before completed reports and by every processing mutation.
  const trainingActive=training&&['draft','queued','running','cancel_requested'].includes(training.state);
  const hasReport=stage.stage_state==='succeeded'&&!trainingActive&&!['failed','cancel_requested','cancelled'].includes(stage.state);
  // latestCameraReview performs currentCameraInput itself; do not take the
  // workspace lock through the same full lineage validation twice per poll.
  camera={runId:stage.run_id,state:stage.state,stageState:stage.stage_state,report:hasReport?await latestCameraReview(c,a,engine,stage.id):null};
 }
 let job=null;
 if(training){
  const hasExports=training.export_state==='succeeded'&&!['failed','cancel_requested','cancelled'].includes(training.state);
  // A failed/cancelled job exposes state only. Do not rebuild its full frame
  // lineage on every poll while a replacement camera job is preparing inputs.
  if(hasExports)await currentTrainingInput(c,a,engine,{id:training.stage_id,input_revision:training.input_revision,input_fingerprint:training.input_fingerprint},undefined,false);
  const artifactIds=hasExports?(await c.query("SELECT id FROM artifacts WHERE stage_id=$1 AND status='private' AND privacy_status IN('pending','passed') AND quality_report->>'kind'='splat_viewer_tier' ORDER BY id",[training.export_stage_id])).rows.map(r=>r.id):[];
  job={runId:training.run_id,state:training.state,trainingState:training.training_state,exportState:training.export_state,artifactIds};
 }
 const available=trainingAvailable();
 return digitizationReconstructionStatus.parse({inputRevision:workspace.inputRevision,workspaceVersion:workspace.version,cameraSolveAvailable:cameraAvailable(),camera,sceneTraining:{available,reason:available?'READY':'GPU_VALIDATION_DEFERRED',job},publiclyServed:false});
}
