import type pg from 'pg';
import {event,type Actor} from '@haven/database';
import {requireCurrentExecution} from './leases.js';
/** A finished private processing graph is ready for review, not published.
 * Completion releases its agency reservation atomically with derivative lineage. */
export async function completeProcessingStage(c:pg.PoolClient,a:Actor,engine:string,run:string,stage:string,execution:string,fence:string){
 await requireCurrentExecution(c,a,engine,stage,execution,fence);
 await c.query("UPDATE processing_stages SET state='succeeded',version=version+1 WHERE id=$1",[stage]);
 await c.query(`UPDATE processing_stages s SET state='queued',version=version+1 WHERE s.run_id=$1 AND s.state='pending' AND NOT EXISTS(SELECT 1 FROM processing_stage_dependencies d JOIN processing_stages dependency ON dependency.id=d.dependency_id WHERE d.stage_id=s.id AND dependency.state<>'succeeded')`,[run]);
 await c.query("UPDATE processing_runs r SET state='awaiting_review',version=version+1 WHERE r.id=$1 AND r.state IN('queued','running') AND r.cancel_requested_at IS NULL AND NOT EXISTS(SELECT 1 FROM processing_stages s WHERE s.run_id=r.id AND s.state NOT IN('succeeded','skipped'))",[run]);
 await c.query("INSERT INTO digitization_events(digitization_id,organization_id,created_by,run_id,kind,state) VALUES($1,$2,$3,$4,'digitization.stage_completed','succeeded')",[engine,a.orgId,a.id,run]);
 await event(c,a,engine,'digitization.stage_completed',{runId:run,stageId:stage,executionId:execution});
}
