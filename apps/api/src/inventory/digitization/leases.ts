import type pg from 'pg';
import {event,type Actor} from '@haven/database';
import {fail} from '../../platform/core.js';
import {checkedWorkspace,requireDigitizationAgency} from './intakes.js';
async function currentStage(c:pg.PoolClient,a:Actor,engine:string,stageId:string){
 await requireDigitizationAgency(c,a);const workspace=await checkedWorkspace(c,engine);
 if(workspace.state!=='active')fail(409,'This digitization is no longer active.','WORKFLOW_CONFLICT');
 const row=(await c.query(`SELECT s.*,r.state AS run_state,r.input_revision AS run_revision,r.cancel_requested_at,least(r.deadline,coalesce(r.started_at,statement_timestamp())+(r.budget->>'maxSeconds')::integer*interval '1 second') AS deadline,r.budget AS run_budget,r.created_by AS run_creator,s.lease_until<=statement_timestamp() AS lease_expired,least(r.deadline,coalesce(r.started_at,statement_timestamp())+(r.budget->>'maxSeconds')::integer*interval '1 second')<=statement_timestamp() AS run_expired FROM processing_stages s JOIN processing_runs r ON r.id=s.run_id AND r.digitization_id=s.digitization_id WHERE s.digitization_id=$1 AND s.id=$2 FOR UPDATE OF s,r`,[engine,stageId])).rows[0];
 if(!row)fail(404,'Processing stage not found.');
 if(row.run_creator!==a.id)fail(403,'This execution requires its currently authorized initiating actor.','EXECUTION_SCOPE_REQUIRED');
 if(row.input_revision!==workspace.inputRevision||row.run_revision!==workspace.inputRevision)fail(409,'The source revision changed. Start a current run.','INPUT_REVISION_CONFLICT');
 if(!['queued','running'].includes(row.run_state)||row.cancel_requested_at||row.run_expired)fail(409,'This run no longer accepts execution.','RUN_NOT_EXECUTABLE');
 return row;
}
/** Short actor transaction. Dispatch idempotency and worker capability checks stay in
 * the API coordinator port; no privileged search worker identity is accepted here.
 */
export async function leaseStage(c:pg.PoolClient,a:Actor,engine:string,stageId:string,expectedVersion:number){
 const row=await currentStage(c,a,engine,stageId);
 if(row.version!==expectedVersion)fail(409,'The processing stage changed.','VERSION_CONFLICT');
 if(row.state!=='queued'||row.attempt>=3)fail(409,'This stage cannot acquire another execution.','STAGE_NOT_EXECUTABLE');
 if(['camera_solve','splat_train'].includes(row.stage_type)&&(await c.query('SELECT digitization_stage_gpu_reserved($1) reserved',[stageId])).rows[0].reserved)fail(409,'The prior exclusive resource awaits confirmed termination.','GPU_RELEASE_UNCONFIRMED');
 const executionId=crypto.randomUUID();
 const leased=(await c.query(`UPDATE processing_stages SET state='leased',version=version+1,attempt=attempt+1,fencing_token=fencing_token+1,execution_id=$2,lease_until=least(statement_timestamp()+interval '120 seconds',$3::timestamptz) WHERE id=$1 RETURNING id,run_id,version,attempt,fencing_token::text,execution_id,lease_until,input_revision,input_fingerprint,profile_id,stage_type`,[stageId,executionId,row.deadline])).rows[0];
 await c.query(`INSERT INTO stage_attempts(digitization_id,organization_id,created_by,stage_id,execution_id,attempt,fencing_token) VALUES($1,$2,$3,$4,$5,$6,$7)`,[engine,a.orgId,a.id,stageId,executionId,leased.attempt,leased.fencing_token]);
 if(row.run_state==='queued')await c.query("UPDATE processing_runs SET state='running',version=version+1,started_at=statement_timestamp() WHERE id=$1",[row.run_id]);
 await c.query("INSERT INTO digitization_events(digitization_id,organization_id,created_by,run_id,kind,state) VALUES($1,$2,$3,$4,'digitization.stage_leased','leased')",[engine,a.orgId,a.id,row.run_id]);
 await event(c,a,engine,'digitization.stage_leased',{runId:row.run_id,stageId,executionId});
 return leased;
}
export async function renewStageLease(c:pg.PoolClient,a:Actor,engine:string,stageId:string,executionId:string,fencingToken:string){
 const row=await requireCurrentExecution(c,a,engine,stageId,executionId,fencingToken);
 const renewed=(await c.query(`UPDATE processing_stages SET state='running',version=version+1,lease_until=least(statement_timestamp()+interval '120 seconds',$2::timestamptz) WHERE id=$1 RETURNING version,lease_until,fencing_token::text,execution_id`,[stageId,row.deadline])).rows[0];
 if(row.state==='leased'){
  await c.query("INSERT INTO digitization_events(digitization_id,organization_id,created_by,run_id,kind,state) VALUES($1,$2,$3,$4,'digitization.stage_started','running')",[engine,a.orgId,a.id,row.run_id]);
  await event(c,a,engine,'digitization.stage_started',{runId:row.run_id,stageId,executionId});
 }
 return renewed;
}
export async function requireCurrentExecution(c:pg.PoolClient,a:Actor,engine:string,stageId:string,executionId:string,fencingToken:string){
 const row=await currentStage(c,a,engine,stageId);
 if(!['leased','running'].includes(row.state)||row.execution_id!==executionId||String(row.fencing_token)!==fencingToken||row.lease_expired)fail(409,'The execution lease expired or was replaced.','STALE_EXECUTION');
 return row;
}
