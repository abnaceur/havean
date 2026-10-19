import type pg from 'pg';
import type {Actor} from '@haven/database';
import {digitizationProcessingMetrics} from '@haven/contracts';
import {checkedWorkspace,requireDigitizationAgency} from './intakes.js';
import {documentOcrAvailable} from './ocr-configuration.js';
import {cameraAvailable} from './camera-input.js';
/** Call only after the fenced stage transition in its existing transaction. */
export async function recordProcessingOutcome(c:pg.PoolClient,a:Actor,engine:string,stage:string,execution:string,fence:string){
 await c.query(`INSERT INTO digitization_stage_outcomes(digitization_id,organization_id,created_by,run_id,stage_id,attempt_id,execution_id,fencing_token,input_revision,outcome,started_at,finished_at)
 SELECT s.digitization_id,s.organization_id,$2,s.run_id,s.id,attempt.id,s.execution_id,s.fencing_token,s.input_revision,s.state,attempt.started_at,statement_timestamp()
 FROM processing_stages s JOIN stage_attempts attempt ON attempt.stage_id=s.id AND attempt.execution_id=s.execution_id AND attempt.fencing_token=s.fencing_token
 WHERE s.digitization_id=$1 AND s.id=$3 AND s.execution_id=$4 AND s.fencing_token=$5::bigint AND s.state IN('succeeded','failed_retryable','failed_terminal')
 ON CONFLICT(execution_id) DO NOTHING`,[engine,a.id,stage,execution,fence]);
}
export async function readProcessingMetrics(c:pg.PoolClient,a:Actor,engine:string){
 await requireDigitizationAgency(c,a);const workspace=await checkedWorkspace(c,engine);
 const runStates=(await c.query('SELECT state,count(*)::integer count FROM processing_runs WHERE digitization_id=$1 AND input_revision=$2 GROUP BY state ORDER BY state',[engine,workspace.inputRevision])).rows;
 const timing=(await c.query(`SELECT count(*)::integer AS "observedOutcomes",count(elapsed_seconds)::integer AS "durationSamples",min(elapsed_seconds)::text AS "minimumSeconds",percentile_disc(.5) WITHIN GROUP(ORDER BY elapsed_seconds)::text AS "p50Seconds",max(elapsed_seconds)::text AS "maximumSeconds" FROM digitization_stage_outcomes WHERE digitization_id=$1 AND input_revision=$2`,[engine,workspace.inputRevision])).rows[0];
 const failures=(await c.query("SELECT error_code AS code,count(*)::integer count FROM digitization_stage_outcomes WHERE digitization_id=$1 AND input_revision=$2 AND outcome IN('failed_terminal','failed_retryable') AND error_code IS NOT NULL GROUP BY error_code ORDER BY count DESC,error_code LIMIT 100",[engine,workspace.inputRevision])).rows;
 const alerts=(await c.query(`WITH current_runs AS (SELECT id,state,least(deadline,coalesce(started_at,statement_timestamp())+(budget->>'maxSeconds')::integer*interval '1 second') effective_deadline FROM processing_runs WHERE digitization_id=$1 AND input_revision=$2), counts AS (
 SELECT 'RUN_DEADLINE_ELAPSED' code,count(*)::integer count FROM current_runs WHERE state IN('queued','running','cancel_requested') AND effective_deadline<=statement_timestamp()
 UNION ALL SELECT 'EXECUTION_LEASE_ELAPSED',count(*)::integer FROM processing_stages s JOIN current_runs r ON r.id=s.run_id WHERE s.digitization_id=$1 AND s.input_revision=$2 AND s.state IN('leased','running') AND s.lease_until<=statement_timestamp()
 UNION ALL SELECT 'RETRY_LIMIT_REACHED',count(*)::integer FROM processing_stages s JOIN current_runs r ON r.id=s.run_id WHERE s.digitization_id=$1 AND s.input_revision=$2 AND s.attempt>=3 AND s.state IN('queued','failed_retryable','failed_terminal')) SELECT code,count FROM counts WHERE count>0 ORDER BY code`,[engine,workspace.inputRevision])).rows;
 return digitizationProcessingMetrics.parse({inputRevision:workspace.inputRevision,runStates,...timing,alerts,failures,cameraSolveAvailable:cameraAvailable(),documentOcrAvailable:documentOcrAvailable(),durationBasis:'lease_to_result_collection',physicalDeviceBenchmark:false,publiclyServed:false});
}
