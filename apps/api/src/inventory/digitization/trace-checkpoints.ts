import {digitizationTraceCheckpointRecord,digitizationTraceConflict,digitizationGeometrySave,type digitizationTraceCheckpoint,type digitizationPlanPageSelection} from '@haven/contracts';
import type {z} from 'zod';
import type {Actor} from '@haven/database';
import type pg from 'pg';
import {fail} from '../../platform/core.js';
import {checkedWorkspace,requireDigitizationAgency} from './intakes.js';
import {validateTraceDraft,readGeometryDraft} from './geometry-drafts.js';
function record(row:any){return digitizationTraceCheckpointRecord.parse({id:row.id,workspaceVersion:row.base_workspace_version,inputRevision:row.input_revision,artifactId:row.source_artifact_id,clockwiseDegrees:Number(row.clockwise_degrees),geometry:row.geometry});}
export async function checkpointTrace(c:pg.PoolClient,a:Actor,engine:string,input:z.infer<typeof digitizationTraceCheckpoint>,selection:z.infer<typeof digitizationPlanPageSelection>){
 const {checkpointId,...body}=input,{workspace,g}=await validateTraceDraft(c,a,engine,digitizationGeometrySave.parse(body),selection);
 if(Buffer.byteLength(JSON.stringify(g))>400000)fail(413,'The private trace exceeds the autosave budget.','TRACE_BUDGET_EXCEEDED');
 const count=(await c.query('SELECT count(*)::int n FROM digitization_trace_checkpoints WHERE digitization_id=$1 AND created_by=$2',[engine,a.id])).rows[0].n;if(count>=2000)fail(429,'Private autosave capacity reached. Save or export your trace before continuing.','TRACE_BUDGET_EXCEEDED');
 const row=(await c.query('INSERT INTO digitization_trace_checkpoints(id,digitization_id,organization_id,created_by,base_workspace_version,input_revision,source_artifact_id,clockwise_degrees,geometry) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[checkpointId,engine,a.orgId,a.id,workspace.version,workspace.inputRevision,input.artifactId,input.clockwiseDegrees,g])).rows[0];return record(row);
}
export async function traceConflict(c:pg.PoolClient,a:Actor,engine:string){
 await requireDigitizationAgency(c,a);const workspace=await checkedWorkspace(c,engine);
 const row=(await c.query('SELECT * FROM digitization_trace_checkpoints WHERE digitization_id=$1 AND created_by=$2 AND input_revision=$3 ORDER BY created_at DESC,id DESC LIMIT 1',[engine,a.id,workspace.inputRevision])).rows[0];
 return digitizationTraceConflict.parse({checkpoint:row?record(row):null,current:await readGeometryDraft(c,a,engine)});
}
