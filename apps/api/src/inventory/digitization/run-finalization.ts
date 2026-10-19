import type pg from 'pg';
/** Caller holds the current actor-scoped run/stage locks and execution fence.
 * A terminal predecessor prevents all pending descendants from executing. */
export async function skipTerminalDependents(c:pg.PoolClient,engine:string,run:string,stage:string){
 await c.query(`WITH RECURSIVE blocked(id) AS (
 SELECT d.stage_id FROM processing_stage_dependencies d JOIN processing_stages s ON s.id=d.stage_id WHERE d.dependency_id=$3 AND s.digitization_id=$1 AND s.run_id=$2
 UNION
 SELECT d.stage_id FROM processing_stage_dependencies d JOIN blocked b ON b.id=d.dependency_id JOIN processing_stages s ON s.id=d.stage_id WHERE s.digitization_id=$1 AND s.run_id=$2
 ) UPDATE processing_stages s SET state='skipped',error_code='PREDECESSOR_FAILED',version=version+1 WHERE s.id IN(SELECT id FROM blocked) AND s.digitization_id=$1 AND s.run_id=$2 AND s.state IN('pending','awaiting_input')`,[engine,run,stage]);
}
/** Close terminal graphs so failures are visible and capacity is released.
 * Successful independent outputs remain private and still require review. */
export async function finalizePrivateProcessingRun(c:pg.PoolClient,engine:string,run:string){
 await c.query(`UPDATE processing_runs r SET state=CASE
 WHEN EXISTS(SELECT 1 FROM processing_stages s WHERE s.run_id=r.id AND s.state IN('failed_terminal','cancelled')) THEN
 CASE WHEN EXISTS(SELECT 1 FROM processing_stages s WHERE s.run_id=r.id AND s.state='succeeded') THEN 'partially_ready' ELSE 'failed' END
 WHEN EXISTS(SELECT 1 FROM artifacts a WHERE a.run_id=r.id AND a.profile_id='private-colmap-cpu-investigation-v1' AND a.quality_report->>'kind'='camera_solve_report' AND a.quality_report#>>'{report,state}'='awaiting_input') THEN 'awaiting_input'
 ELSE 'awaiting_review' END,version=version+1
 WHERE r.id=$2 AND r.digitization_id=$1 AND r.state='running' AND r.cancel_requested_at IS NULL
 AND NOT EXISTS(SELECT 1 FROM processing_stages s WHERE s.run_id=r.id AND s.state NOT IN('succeeded','skipped','failed_terminal','cancelled'))`,[engine,run]);
}
