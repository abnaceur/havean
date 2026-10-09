import type pg from 'pg';
import {digitizationRun,type DigitizationRun} from '@haven/contracts';
import {event,type Actor} from '@haven/database';
import {fail} from '../../platform/core.js';
import {requireRunBudget} from './budgets.js';
import {checkedWorkspace,requireDigitizationAgency} from './intakes.js';

/** Persist a server-prepared graph in the caller's short, actor-scoped transaction.
 * Dispatch/runner capabilities are separate; storing a graph never publishes outputs.
 */
export async function createRunGraph(c:pg.PoolClient,a:Actor,workspaceId:string,expectedVersion:number,input:DigitizationRun,desiredOutputs:readonly ('facts'|'plan'|'gallery'|'panorama'|'scene')[]){
 const graph=digitizationRun.parse(input);
 if(!Array.isArray(desiredOutputs)||desiredOutputs.length<1||desiredOutputs.length>5||new Set(desiredOutputs).size!==desiredOutputs.length||desiredOutputs.some(output=>!['facts','plan','gallery','panorama','scene'].includes(output)))fail(422,'Select supported processing outputs.','INVALID_RUN_OUTPUTS');
 await requireDigitizationAgency(c,a);
 const workspace=await checkedWorkspace(c,workspaceId);
 if(workspace.version!==expectedVersion)fail(409,'The digitization changed. Reload before starting processing.','VERSION_CONFLICT');
 if(graph.organizationId!==workspace.organizationId||graph.creatorId!==a.id||graph.target.type!==workspace.target.type||graph.target.id!==workspace.target.id||graph.target.type==='listing'&&graph.target.unitId!==workspace.unitId)fail(403,'Run scope does not match this workspace.','DIGITIZATION_SCOPE_REQUIRED');
 if(graph.inputRevision!==workspace.inputRevision||graph.inputRevision<1)fail(409,'The source revision changed. Reload before starting processing.','INPUT_REVISION_CONFLICT');
 if(graph.version!==1||graph.state!=='draft'||graph.stages.some(s=>s.state!=='pending'||s.attempt!==0||s.fencingToken!==null||s.executionId!==null||s.progress!==null))fail(422,'A new run must contain only unstarted stages.','INVALID_RUN_GRAPH');
 const remaining=Date.parse(graph.deadline)-Date.now();
 if(remaining<=0||remaining>86400000||graph.budget.maxSeconds*1000>remaining)fail(422,'The processing budget must fit its future deadline.','INVALID_RUN_BUDGET');
 await requireRunBudget(c,a,workspaceId,graph.budget);
 await c.query(`INSERT INTO processing_runs(id,digitization_id,organization_id,created_by,input_revision,desired_outputs,budget,deadline) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[graph.id,workspaceId,a.orgId,a.id,graph.inputRevision,desiredOutputs,graph.budget,graph.deadline]);
 for(const stage of graph.stages)await c.query(`INSERT INTO processing_stages(id,digitization_id,organization_id,created_by,run_id,stage_type,input_revision,input_fingerprint,profile_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[stage.id,workspaceId,a.orgId,a.id,graph.id,stage.type,graph.inputRevision,stage.inputFingerprint,stage.profileId]);
 for(const stage of graph.stages)for(const dependency of stage.dependencies)await c.query(`INSERT INTO processing_stage_dependencies(digitization_id,organization_id,created_by,stage_id,dependency_id) VALUES($1,$2,$3,$4,$5)`,[workspaceId,a.orgId,a.id,stage.id,dependency]);
 await c.query(`INSERT INTO digitization_events(digitization_id,organization_id,created_by,run_id,kind,state) VALUES($1,$2,$3,$4,'digitization.run_created','draft')`,[workspaceId,a.orgId,a.id,graph.id]);
 await event(c,a,workspaceId,'digitization.run_created',{runId:graph.id,inputRevision:graph.inputRevision,stageCount:graph.stages.length});
 return graph;
}

/** Seal the graph and enqueue its roots in the same short transaction as the
 * outbox event. Queue delivery never grants access to source bytes by itself.
 */
export async function dispatchRunGraph(c:pg.PoolClient,a:Actor,engine:string,runId:string,expectedVersion:number){
 await requireDigitizationAgency(c,a);
 const workspace=await checkedWorkspace(c,engine);
 if(workspace.state!=='active')fail(409,'This digitization is no longer active.','WORKFLOW_CONFLICT');
 const run=(await c.query('SELECT *,deadline<=statement_timestamp() AS expired FROM processing_runs WHERE digitization_id=$1 AND id=$2 FOR UPDATE',[engine,runId])).rows[0];
 if(!run)fail(404,'Processing run not found.');
 if(run.created_by!==a.id)fail(403,'Dispatch requires the currently authorized initiating actor.','EXECUTION_SCOPE_REQUIRED');
 if(run.version!==expectedVersion)fail(409,'The processing run changed.','VERSION_CONFLICT');
 if(run.state!=='draft'||run.cancel_requested_at||run.expired)fail(409,'This run cannot be dispatched.','RUN_NOT_EXECUTABLE');
 if(run.input_revision!==workspace.inputRevision)fail(409,'The source revision changed.','INPUT_REVISION_CONFLICT');
 await requireRunBudget(c,a,engine,run.budget,runId);
 const sources=(await c.query('SELECT source_set FROM property_input_revisions WHERE digitization_id=$1 AND revision=$2',[engine,run.input_revision])).rows[0]?.source_set;
 if(!Array.isArray(sources)||sources.length===0)fail(422,'Add supported sources before processing.','SOURCE_NOT_FOUND');
 for(const source of sources){
  if(!(await c.query("SELECT digitization_asset_access($1,$2,$3,$4,'document_processing') allowed",[engine,source.assetId,source.assetVersion,run.input_revision])).rows[0].allowed)fail(403,'Current evidence processing authority is required.','SOURCE_ACCESS_CHANGED');
 }
 const stages=(await c.query('SELECT id,state FROM processing_stages WHERE run_id=$1 AND digitization_id=$2 FOR UPDATE',[runId,engine])).rows;
 if(!stages.length||stages.some(stage=>stage.state!=='pending'))fail(409,'This run requires an unstarted stage graph.','INVALID_RUN_GRAPH');
 const result=(await c.query("UPDATE processing_runs SET state='queued',version=version+1 WHERE id=$1 RETURNING id,state,version",[runId])).rows[0];
 const roots=(await c.query(`UPDATE processing_stages s SET state='queued',version=version+1 WHERE s.run_id=$1 AND NOT EXISTS(SELECT 1 FROM processing_stage_dependencies d WHERE d.stage_id=s.id) RETURNING s.id`,[runId])).rows;
 if(!roots.length)fail(409,'The processing graph has no executable roots.','INVALID_RUN_GRAPH');
 await c.query("INSERT INTO digitization_events(digitization_id,organization_id,created_by,run_id,kind,state) VALUES($1,$2,$3,$4,'digitization.run_queued','queued')",[engine,a.orgId,a.id,runId]);
 await event(c,a,engine,'digitization.run_queued',{runId,inputRevision:run.input_revision});
 return {...result,stageIds:roots.map(stage=>stage.id).sort()};
}
