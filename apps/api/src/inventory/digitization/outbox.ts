import type pg from 'pg';
import type {Actor} from '@haven/database';
import {digitizationOutboxReceipt} from '@haven/contracts';
import {fail} from '../../platform/core.js';
import {checkedWorkspace,requireDigitizationAgency} from './intakes.js';
import {cpuSourceFingerprint} from './execution-scope.js';
import {leaseStage} from './leases.js';
const notifications=new Set(['digitization.created','digitization.intake_created','digitization.evidence_granted','digitization.inputs_changed','digitization.capture_reserved','digitization.capture_started','digitization.capture_cancelled','digitization.capture_quarantined','digitization.run_created','digitization.stage_failed','digitization.run_cancelled','digitization.stage_leased','digitization.stage_started','digitization.geometry_saved']);

/** An engine effect acknowledges durable execution handoffs, never publication.
 * The event lock and receipt are in the same transaction as acquiring leases.
 */
export async function consumeDigitizationEvent(c:pg.PoolClient,a:Actor,eventId:string,engine:string,runId:string|null){
 await requireDigitizationAgency(c,a);const workspace=await checkedWorkspace(c,engine);
 const event=(await c.query('SELECT kind,payload FROM outbox WHERE id=$1 AND aggregate_id=$2 FOR UPDATE',[eventId,engine])).rows[0];
 if(!event?.kind.startsWith('digitization.'))fail(422,'This event belongs to a different consumer.','OUTBOX_CONSUMER_MISMATCH');
 if(!notifications.has(event.kind)&&!['digitization.run_queued','digitization.stage_completed','digitization.cancel_requested'].includes(event.kind))fail(422,'This engine event version is not supported.','ENGINE_EVENT_UNSUPPORTED');
 const prior=(await c.query("SELECT receipt FROM outbox_effects WHERE event_id=$1 AND consumer='digitization'",[eventId])).rows[0];
 if(prior?.receipt){
  if(runId&&event.kind!=='digitization.cancel_requested'&&!(await c.query("SELECT digitization_revision_access($1,input_revision,'document_processing') allowed FROM processing_runs WHERE id=$2 AND digitization_id=$1",[engine,runId])).rows[0]?.allowed)fail(403,'Current evidence authority is required.','SOURCE_ACCESS_CHANGED');
  const receipt=digitizationOutboxReceipt.parse(prior.receipt);
  // The original receipt remains immutable. Reattach its logical stages to their
  // current durable attempts; an expired lease gets a new execution and fence.
  for(const handoff of receipt.executions){
   const stage=(await c.query('SELECT *,lease_until<=statement_timestamp() expired FROM processing_stages WHERE id=$1 AND digitization_id=$2 AND run_id=$3 FOR UPDATE',[handoff.stageId,engine,runId])).rows[0];
   if(!stage)fail(404,'Processing stage not found.');
   if(stage.state==='failed_retryable'||['leased','running'].includes(stage.state)&&stage.expired){
    if(['camera_solve','splat_train'].includes(stage.stage_type)&&(await c.query('SELECT digitization_stage_gpu_reserved($1) reserved',[stage.id])).rows[0].reserved)fail(409,'The prior exclusive resource awaits confirmed termination.','GPU_RELEASE_UNCONFIRMED');
    if(stage.attempt>=3)fail(409,'This stage exhausted its execution attempts.','EXECUTION_ATTEMPTS_EXHAUSTED');
    // leaseStage rechecks run/revision/initiating authority. Both transitions and
    // the new attempt roll back together if cancellation or authority changed.
    if(stage.state!=='failed_retryable')await c.query("UPDATE processing_stages SET state='failed_retryable',version=version+1 WHERE id=$1",[stage.id]);
    const queued=(await c.query("UPDATE processing_stages SET state='queued',version=version+1 WHERE id=$1 RETURNING version",[stage.id])).rows[0];
    const replacement=await leaseStage(c,a,engine,stage.id,queued.version);
    handoff.executionId=replacement.execution_id;handoff.fencingToken=String(replacement.fencing_token);
   }else if(stage.execution_id){handoff.executionId=stage.execution_id;handoff.fencingToken=String(stage.fencing_token);}
  }
  return receipt;
 }
 const executions=[];
 if(['digitization.run_queued','digitization.stage_completed'].includes(event.kind)){
  if(!runId||event.payload.runId!==runId)fail(422,'The event has no scoped processing run.','ENGINE_EVENT_INVALID');
  const run=(await c.query('SELECT state,input_revision,created_by,cancel_requested_at,deadline<=statement_timestamp() expired FROM processing_runs WHERE id=$1 AND digitization_id=$2 FOR UPDATE',[runId,engine])).rows[0];
  if(!run||run.created_by!==a.id)fail(403,'The initiating actor no longer has processing authority.','EXECUTION_SCOPE_REQUIRED');
  if(run.input_revision!==workspace.inputRevision||run.cancel_requested_at||run.expired||!['queued','running'].includes(run.state)&&!(event.kind==='digitization.stage_completed'&&['awaiting_review','ready'].includes(run.state)&&!(await c.query("SELECT 1 FROM processing_stages WHERE run_id=$1 AND state NOT IN('succeeded','skipped') LIMIT 1",[runId])).rowCount))fail(409,'This run no longer accepts execution.','RUN_NOT_EXECUTABLE');
  const sources=(await c.query('SELECT source_set FROM property_input_revisions WHERE digitization_id=$1 AND revision=$2',[engine,run.input_revision])).rows[0]?.source_set??[];
  const queued=(await c.query("SELECT id,version,input_fingerprint,profile_id FROM processing_stages WHERE run_id=$1 AND state='queued' ORDER BY id FOR UPDATE",[runId])).rows;
  if(queued.length>100)fail(422,'This graph exceeds its stage budget.','INVALID_RUN_GRAPH');
  for(const stage of queued){
   const matches=sources.filter((source:any)=>cpuSourceFingerprint(engine,a.orgId!,run.input_revision,stage.profile_id,source)===stage.input_fingerprint);
   if(matches.length!==1)fail(422,'Stage inputs must identify exactly one scoped source.','SOURCE_SELECTION_AMBIGUOUS');
   const source=matches[0];
   if(!(await c.query("SELECT digitization_asset_access($1,$2,$3,$4,'document_processing') allowed",[engine,source.assetId,source.assetVersion,run.input_revision])).rows[0].allowed)fail(403,'Current evidence processing authority is required.','SOURCE_ACCESS_CHANGED');
   const lease=await leaseStage(c,a,engine,stage.id,stage.version);
   executions.push({engineId:engine,actorId:a.id,organizationId:a.orgId,stageId:stage.id,executionId:lease.execution_id,fencingToken:lease.fencing_token,assetId:source.assetId});
  }
 }
 let cancellation=null;
 if(event.kind==='digitization.cancel_requested'){
  if(!runId||event.payload.runId!==runId||!(await c.query('SELECT digitization_cancellation_metadata($1,$2) metadata',[engine,runId])).rows[0]?.metadata)fail(404,'Pending cancellation not found.');
  cancellation={engineId:engine,runId,actorId:a.id,organizationId:a.orgId};
 }
 const receipt=digitizationOutboxReceipt.parse({eventId,executions,cancellation});
 await c.query("INSERT INTO outbox_effects(event_id,consumer,receipt) VALUES($1,'digitization',$2)",[eventId,receipt]);
 await c.query('UPDATE outbox SET processed_at=statement_timestamp() WHERE id=$1',[eventId]);
 return receipt;
}
