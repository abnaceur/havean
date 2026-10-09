import type pg from 'pg';
import {event,type Actor} from '@haven/database';
import {fail,transaction} from '../../platform/core.js';
import {checkedWorkspace,requireDigitizationAgency} from './intakes.js';
import {buildCpuExecutionRequest,cpuSourceFingerprint} from './execution-scope.js';
import type {CpuRunnerClient} from './runner-client.js';

/** Persist cancellation before contacting a runner. A lost delivery leaves the run
 * fenced against renewals/completions and can be reconciled from PostgreSQL.
 * Closing the run is separate: the coordinator must confirm child termination.
 */
export async function requestRunCancellation(c:pg.PoolClient,a:Actor,engine:string,runId:string,expectedVersion:number){
 await requireDigitizationAgency(c,a);await checkedWorkspace(c,engine);
 const run=(await c.query('SELECT id,state,version,created_by FROM processing_runs WHERE digitization_id=$1 AND id=$2 FOR UPDATE',[engine,runId])).rows[0];
 if(!run)fail(404,'Processing run not found.');
 if(run.created_by!==a.id)fail(403,'Cancel requires the currently authorized initiating actor.','EXECUTION_SCOPE_REQUIRED');
 if(run.version!==expectedVersion)fail(409,'The processing run changed.','VERSION_CONFLICT');
 if(['cancel_requested','cancelled'].includes(run.state))return {id:run.id,state:run.state,version:run.version};
 if(run.state==='ready')fail(409,'A completed run cannot be cancelled.','RUN_NOT_CANCELLABLE');
 const result=(await c.query("UPDATE processing_runs SET state='cancel_requested',cancel_requested_at=statement_timestamp(),version=version+1 WHERE id=$1 RETURNING id,state,version",[runId])).rows[0];
 await c.query("INSERT INTO digitization_events(digitization_id,organization_id,created_by,run_id,kind,state) VALUES($1,$2,$3,$4,'digitization.cancel_requested','cancel_requested')",[engine,a.orgId,a.id,runId]);
 await event(c,a,engine,'digitization.cancel_requested',{runId});
 return result;
}

/** Runner stop acknowledgement precedes closure. SQL cleanup can see opaque
 * original descriptors after grant revocation; no source is transferred/read.
 */
export async function completeRunCancellation(a:Actor,engine:string,runId:string,client:CpuRunnerClient){
 const prepared=await transaction(a,async c=>{
  await requireDigitizationAgency(c,a);await checkedWorkspace(c,engine);
  const metadata=(await c.query('SELECT digitization_cancellation_metadata($1,$2) metadata',[engine,runId])).rows[0]?.metadata;
  if(!metadata)fail(404,'Pending cancellation not found.');
  const requests=[];
  if(metadata.state!=='cancelled')for(const stage of metadata.stages){
   if(!stage.execution_id||['succeeded','failed_terminal','skipped','cancelled'].includes(stage.state))continue;
   const sources=metadata.sources.filter((source:any)=>cpuSourceFingerprint(engine,a.orgId!,stage.input_revision,stage.profile_id,source)===stage.input_fingerprint);
   if(sources.length!==1)fail(422,'Cancellation source scope is ambiguous.','SOURCE_SELECTION_AMBIGUOUS');
   requests.push(buildCpuExecutionRequest(a,engine,stage.id,stage.execution_id,String(stage.fencing_token),stage,sources[0]));
  }
  return {version:metadata.version,requests};
 });
 for(const request of prepared.requests)try{await client.stop(request);}catch{fail(503,'Process termination is not yet confirmed.','CPU_CANCELLATION_UNCONFIRMED');}
 return transaction(a,async c=>{
  await requireDigitizationAgency(c,a);await checkedWorkspace(c,engine);
  const {changed,...receipt}=(await c.query('SELECT digitization_close_cancellation($1,$2,$3) receipt',[engine,runId,prepared.version])).rows[0].receipt;
  if(changed){
   await c.query("INSERT INTO digitization_events(digitization_id,organization_id,created_by,run_id,kind,state) VALUES($1,$2,$3,$4,'digitization.run_cancelled','cancelled')",[engine,a.orgId,a.id,runId]);
   await event(c,a,engine,'digitization.run_cancelled',{runId});
  }
  return receipt;
 });
}
