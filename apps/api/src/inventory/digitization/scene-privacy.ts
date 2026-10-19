import type pg from 'pg';
import {event,type Actor} from '@haven/database';
import {digitizationScenePrivacyCreate,digitizationScenePrivacyRecord,digitizationScenePrivacyContext,digitizationGeometryRevision,type DigitizationScenePrivacyCreate} from '@haven/contracts';
import {fail} from '../../platform/core.js';
import {checkedWorkspace,requireDigitizationAgency} from './intakes.js';
import {privateSceneTiers} from './scene-preview.js';

export function validateSceneCoverage(input:DigitizationScenePrivacyCreate,roomIds:string[]){
 const x=digitizationScenePrivacyCreate.parse(input);
 if(x.coverage.length!==roomIds.length||x.coverage.some(room=>!roomIds.includes(room.roomId)))fail(422,'Declare every current plan room, including unknown and excluded rooms.','SCENE_COVERAGE_REQUIRED');
 return x;
}
async function geometryContext(c:pg.PoolClient,engine:string,inputRevision:number){
 const row=(await c.query('SELECT id,input_revision,geometry FROM geometry_revisions WHERE digitization_id=$1 ORDER BY revision DESC LIMIT 1',[engine])).rows[0];
 if(!row||row.input_revision!==inputRevision)return {geometryRevisionId:null,rooms:[]};
 const geometry=digitizationGeometryRevision.parse(row.geometry);
 return {geometryRevisionId:row.id,rooms:geometry.rooms.map(room=>({id:room.id,label:room.name}))};
}
function record(row:any,workspaceVersion:number,current:boolean){return digitizationScenePrivacyRecord.parse({id:row.id,workspaceVersion,inputRevision:row.input_revision,artifactId:row.artifact_id,geometryRevisionId:row.geometry_revision_id,coverage:row.coverage,inspection:row.inspection,note:row.note,current,reviewStatus:'pending',privacyReviewRequired:true,publiclyServed:false});}
export async function readScenePrivacy(c:pg.PoolClient,a:Actor,engine:string){
 await requireDigitizationAgency(c,a);const w=await checkedWorkspace(c,engine),geometry=await geometryContext(c,engine,w.inputRevision),tiers=await privateSceneTiers(c,a,engine);
 const rows=(await c.query('SELECT p.*,ar.version current_artifact_version,ar.checksum current_checksum FROM digitization_scene_privacy_declarations p JOIN artifacts ar ON ar.id=p.artifact_id WHERE p.digitization_id=$1 ORDER BY p.created_at DESC,p.id DESC LIMIT 100',[engine])).rows;
 return digitizationScenePrivacyContext.parse({workspaceVersion:w.version,inputRevision:w.inputRevision,...geometry,declarations:rows.map(row=>record(row,w.version,w.state==='active'&&row.input_revision===w.inputRevision&&row.geometry_revision_id===geometry.geometryRevisionId&&tiers.some(tier=>tier.id===row.artifact_id)&&row.artifact_version===row.current_artifact_version&&row.artifact_checksum===row.current_checksum))});
}
/** An author's inspection is an immutable private declaration. It cannot grant
 * independent approval, registration, public access or completeness. */
export async function saveScenePrivacy(c:pg.PoolClient,a:Actor,engine:string,input:DigitizationScenePrivacyCreate){
 await requireDigitizationAgency(c,a);const w=await checkedWorkspace(c,engine),x=digitizationScenePrivacyCreate.parse(input);
 if(w.state!=='active')fail(409,'This workspace no longer accepts declarations.','WORKFLOW_CONFLICT');
 if(w.version!==x.workspaceVersion||w.inputRevision!==x.inputRevision)fail(409,'Reload the current source and workspace.','VERSION_CONFLICT');
 if(!(await c.query("SELECT digitization_revision_access($1,$2,'document_processing') allowed",[engine,x.inputRevision])).rows[0].allowed)fail(403,'Current source processing authority is required.','SOURCE_ACCESS_CHANGED');
 const geometry=await geometryContext(c,engine,w.inputRevision);
 if(geometry.geometryRevisionId!==x.geometryRevisionId)fail(409,'Reload the current plan before declaring coverage.','GEOMETRY_REVISION_CONFLICT');
 validateSceneCoverage(x,geometry.rooms.map(room=>room.id));
 const tiers=await privateSceneTiers(c,a,engine);if(!tiers.some(tier=>tier.id===x.artifactId))fail(404,'Current private scene tier not found.');
 if((await c.query('SELECT count(*)::int n FROM digitization_scene_privacy_declarations WHERE digitization_id=$1',[engine])).rows[0].n>=1000)fail(429,'Private scene declaration capacity reached.');
 const row=(await c.query(`INSERT INTO digitization_scene_privacy_declarations(digitization_id,organization_id,created_by,workspace_version,input_revision,artifact_id,artifact_version,artifact_checksum,geometry_revision_id,coverage,inspection,note) SELECT $1,$2,$3,$4,$5,ar.id,ar.version,ar.checksum,$7,$8,$9,$10 FROM artifacts ar WHERE ar.id=$6 AND ar.digitization_id=$1 RETURNING *`,[engine,a.orgId,a.id,w.version,w.inputRevision,x.artifactId,x.geometryRevisionId,JSON.stringify(x.coverage),x.inspection,x.note])).rows[0];
 const changed=(await c.query('UPDATE property_digitizations SET version=version+1 WHERE id=$1 RETURNING version',[engine])).rows[0];
 await event(c,a,engine,'digitization.scene_privacy_declared',{declarationId:row.id,artifactId:x.artifactId,inputRevision:x.inputRevision,inspection:x.inspection});
 return record(row,changed.version,true);
}
