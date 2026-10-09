import type {Actor} from '@haven/database';
import {event} from '@haven/database';
import type pg from 'pg';
import {digitizationGeometryDraft,digitizationGeometrySave,digitizationPlanPageSelection,digitizationGeometryCalibration,digitizationGeometryRevision} from '@haven/contracts';
import type {z} from 'zod';
import {fail} from '../../platform/core.js';
import {checkedWorkspace,requireDigitizationAgency} from './intakes.js';
import {selectPlanPageTransform} from './plan-page.js';
import {calibratePlanTrace} from './plan-scale.js';
type Save=z.infer<typeof digitizationGeometrySave>;
type Selection=z.infer<typeof digitizationPlanPageSelection>;
export async function requireCalibrationReplayScope(c:pg.PoolClient,a:Actor,engine:string,geometryId:string){
 await requireDigitizationAgency(c,a);const workspace=await checkedWorkspace(c,engine);
 if(workspace.state!=='active')fail(409,'This workspace no longer accepts scale changes.','WORKFLOW_CONFLICT');
 const row=(await c.query('SELECT input_revision FROM geometry_revisions WHERE id=$1 AND digitization_id=$2 AND input_revision IS NOT NULL',[geometryId,engine])).rows[0];
 if(!row)fail(404,'Scoped geometry reference not found.');
 if(row.input_revision!==workspace.inputRevision)fail(409,'The source revision changed.','INPUT_REVISION_CONFLICT');
 if(!(await c.query("SELECT digitization_revision_access($1,$2,'document_processing') allowed",[engine,row.input_revision])).rows[0].allowed)fail(403,'Current source processing authority is required.','SOURCE_ACCESS_CHANGED');
}
function draftRecord(workspaceVersion:number,row:any){
 const {clockwiseDegrees,...stored}=row.source_selection;
 const selection=digitizationPlanPageSelection.parse({...stored,uprightToModel:stored.uprightToModel??selectPlanPageTransform(stored.uprightWidth,stored.uprightHeight,[1,0,0,0,1,0,0,0,1],clockwiseDegrees).originalToModel}),g=digitizationGeometryRevision.parse(row.geometry);
 const source=g.sources.find(s=>s.kind==='asset'&&s.assetId===selection.source.assetId&&s.page===selection.source.page);
 if(!source||source.kind!=='asset')fail(422,'The geometry source context is invalid.','GEOMETRY_SOURCE_INVALID');
 const base=selection.source.originalToModel,actual=source.originalToModel,ratio=Math.sqrt(Math.abs((actual[0]*actual[4]-actual[1]*actual[3])/(base[0]*base[4]-base[1]*base[3])));
 if(!Number.isFinite(ratio)||ratio<=0||actual.some((v,i)=>Math.abs(v-base[i]*(i<6?ratio:1))>Math.max(1e-8,Math.abs(v)*1e-8)))fail(422,'The geometry scale context is invalid.','GEOMETRY_SOURCE_INVALID');
 return digitizationGeometryDraft.parse({workspaceVersion,inputRevision:row.input_revision,artifactId:row.source_artifact_id,clockwiseDegrees,geometry:g,view:{width:selection.width*ratio,height:selection.height*ratio,scaleRatio:ratio,uprightToModel:selection.uprightToModel.map((v,i)=>i<6?v*ratio:v)}});
}
export async function readGeometryDraft(c:pg.PoolClient,a:Actor,engine:string){
 await requireDigitizationAgency(c,a);const workspace=await checkedWorkspace(c,engine);
 const row=(await c.query('SELECT geometry,input_revision,source_artifact_id,source_selection FROM geometry_revisions WHERE digitization_id=$1 AND input_revision IS NOT NULL ORDER BY revision DESC LIMIT 1',[engine])).rows[0];
 if(!row)return null;
 if(row.input_revision!==workspace.inputRevision)fail(409,'The draft belongs to an earlier source revision.','INPUT_REVISION_CONFLICT');
 return draftRecord(workspace.version,row);
}
export async function validateTraceDraft(c:pg.PoolClient,a:Actor,engine:string,input:Save,selection:Selection){
 await requireDigitizationAgency(c,a);const workspace=await checkedWorkspace(c,engine),x=digitizationGeometrySave.parse(input),g=x.geometry;
 if(workspace.state!=='active')fail(409,'This workspace no longer accepts drafts.','WORKFLOW_CONFLICT');
 if(workspace.version!==x.version||selection.workspaceVersion!==x.version||selection.inputRevision!==workspace.inputRevision)fail(409,'The workspace or source changed. Reload before saving.','VERSION_CONFLICT');
 if(g.organizationId!==workspace.organizationId||g.targetId!==workspace.target.id||selection.digitizationId!==engine||selection.artifactId!==x.artifactId)fail(403,'The draft scope does not match this workspace.','DIGITIZATION_SCOPE_REQUIRED');
 if(g.unit!=='px'||g.scaleStatus!=='unscaled'||g.review.status!=='pending'||g.review.actorId!==null||g.scaleAnchors.length||g.floors.some(f=>f.height!==null||f.elevation!=='0')||g.walls.some(w=>w.height!==null)||g.openings.some(o=>o.height!==null||o.sill!==null)||g.rooms.some(r=>r.panoramaSceneId!==null))fail(422,'A trace remains unscaled with unknown heights and pending review.','GEOMETRY_TRACE_SCOPE_REQUIRED');
 const source=selection.source,allSources=[...g.sources,...g.floors.map(f=>f.source),...g.rooms.map(r=>r.source),...g.walls.map(w=>w.source),...g.openings.map(o=>o.source),...g.stairs.map(s=>s.source)];
 if(g.sourceAssets.length!==1||g.sourceAssets[0]!==source.assetId||allSources.some(s=>JSON.stringify(s)!==JSON.stringify(source)))fail(422,'Every trace item must retain its selected source-page transform.','GEOMETRY_SOURCE_INVALID');
 const live=(await c.query("SELECT 1 FROM artifacts ar JOIN digitization_asset_bindings b ON b.digitization_id=ar.digitization_id AND b.input_revision=ar.input_revision WHERE ar.id=$1 AND ar.digitization_id=$2 AND ar.input_revision=$3 AND ar.status='private' AND b.asset_id=$4 AND digitization_asset_access($2,b.asset_id,b.asset_version,$3,'document_processing')",[x.artifactId,engine,workspace.inputRevision,source.assetId])).rowCount;
 if(!live)fail(403,'Current source processing authority is required.','SOURCE_ACCESS_CHANGED');
 return {workspace,x,g};
}
/** A trace save is a private immutable child; measured scale/heights, review and
 * publication require separate authority/evidence ports and are refused here.
 */
export async function saveGeometryDraft(c:pg.PoolClient,a:Actor,engine:string,input:Save,selection:Selection){
 const {workspace,x,g}=await validateTraceDraft(c,a,engine,input,selection);
 // The mutable workspace is already locked; immutable geometry deliberately
 // has no UPDATE policy, so a row-locking SELECT would hide its parent.
 const parent=(await c.query('SELECT id,revision FROM geometry_revisions WHERE digitization_id=$1 ORDER BY revision DESC LIMIT 1',[engine])).rows[0];
 if(g.parentRevision!==(parent?.revision??null)||g.revision!==(parent?.revision??0)+1)fail(409,'The geometry parent changed. Reload before saving.','GEOMETRY_REVISION_CONFLICT');
 await c.query(`INSERT INTO geometry_revisions(id,digitization_id,organization_id,created_by,revision,parent_id,schema_version,geometry,scale_status,input_revision,source_artifact_id,source_selection) VALUES($1,$2,$3,$4,$5,$6,2,$7,'unscaled',$8,$9,$10)`,[g.id,engine,a.orgId,a.id,g.revision,parent?.id??null,g,workspace.inputRevision,x.artifactId,{...selection,clockwiseDegrees:x.clockwiseDegrees}]);
 const changed=(await c.query('UPDATE property_digitizations SET version=version+1 WHERE id=$1 RETURNING version',[engine])).rows[0];
 await c.query("INSERT INTO digitization_events(digitization_id,organization_id,created_by,kind,state) VALUES($1,$2,$3,'digitization.geometry_saved','draft')",[engine,a.orgId,a.id]);
 await event(c,a,engine,'digitization.geometry_saved',{geometryRevisionId:g.id,revision:g.revision,inputRevision:workspace.inputRevision});
 return draftRecord(changed.version,{input_revision:workspace.inputRevision,source_artifact_id:x.artifactId,source_selection:{...selection,clockwiseDegrees:x.clockwiseDegrees},geometry:g});
}
/** A manually observed reference creates estimated scale, never official area,
 * measured registration, known height or independent reviewer approval.
 */
export async function calibrateGeometryDraft(c:pg.PoolClient,a:Actor,engine:string,input:z.infer<typeof digitizationGeometryCalibration>){
 await requireDigitizationAgency(c,a);const workspace=await checkedWorkspace(c,engine),x=digitizationGeometryCalibration.parse(input);
 if(workspace.state!=='active'||workspace.version!==x.version)fail(409,'The workspace changed. Reload before calibrating.','VERSION_CONFLICT');
 const row=(await c.query('SELECT id,geometry,input_revision,source_artifact_id,source_selection FROM geometry_revisions WHERE digitization_id=$1 AND input_revision IS NOT NULL ORDER BY revision DESC LIMIT 1',[engine])).rows[0];
 if(!row||row.id!==x.geometryRevisionId)fail(409,'Select the current geometry revision.','GEOMETRY_REVISION_CONFLICT');
 if(row.input_revision!==workspace.inputRevision)fail(409,'The source revision changed.','INPUT_REVISION_CONFLICT');
 const draft=draftRecord(workspace.version,row),wall=draft.geometry.walls.find(w=>w.id===x.wallId);
 if(!wall)fail(422,'Select a traced reference wall.','SCALE_REFERENCE_REQUIRED');
 if(draft.geometry.review.status!=='pending')fail(409,'This geometry no longer accepts draft scale changes.','WORKFLOW_CONFLICT');
 // Creation RLS independently rechecks document-processing authority for the
 // exact immutable input; a preview-only grant cannot calibrate its evidence.
 const anchored={...draft.geometry,scaleAnchors:[...draft.geometry.scaleAnchors,{id:'scale-'+crypto.randomUUID(),points:[wall.start,wall.end] as [{x:number;y:number},{x:number;y:number}],distanceMetres:x.distanceMetres,source:{kind:'manual' as const,actorId:a.id,note:x.note},reviewerId:a.id,status:'pending' as const}]};
 let calibrated;
 try{calibrated=calibratePlanTrace(anchored,anchored.scaleAnchors.at(-1)!.id,a.id);}
 catch{fail(422,'Scale requires one unscaled floor, a positive observed distance and unknown vertical dimensions.','GEOMETRY_SCALE_INVALID');}
 await c.query(`INSERT INTO geometry_revisions(id,digitization_id,organization_id,created_by,revision,parent_id,schema_version,geometry,scale_status,input_revision,source_artifact_id,source_selection) VALUES($1,$2,$3,$4,$5,$6,2,$7,'estimated',$8,$9,$10)`,[calibrated.id,engine,a.orgId,a.id,calibrated.revision,row.id,calibrated,row.input_revision,row.source_artifact_id,row.source_selection]);
 const changed=(await c.query('UPDATE property_digitizations SET version=version+1 WHERE id=$1 RETURNING version',[engine])).rows[0];
 await c.query("INSERT INTO digitization_events(digitization_id,organization_id,created_by,kind,state) VALUES($1,$2,$3,'digitization.geometry_saved','draft')",[engine,a.orgId,a.id]);
 await event(c,a,engine,'digitization.geometry_saved',{geometryRevisionId:calibrated.id,revision:calibrated.revision,inputRevision:row.input_revision});
 return draftRecord(changed.version,{...row,geometry:calibrated});
}
