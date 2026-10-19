import type pg from 'pg';
import type {FastifyRequest} from 'fastify';
import {event,type Actor} from '@haven/database';
import {digitizationRegistrationReviewSubmit,digitizationRegistrationReviewRequest,digitizationRegistrationReviewApproval,digitizationRegistrationNavigation,digitizationSceneRegistrationCreate,digitizationGeometryRevision,type DigitizationRegistrationReviewSubmit} from '@haven/contracts';
import {fail,transaction,idempotent} from '../../platform/core.js';
import {checkedWorkspace,requireDigitizationAgency} from './intakes.js';
import {readPrivateSceneTier} from './scene-preview.js';
import {readGeometryPng} from './geometry-preview.js';
import {verifySmallDigitizationSource} from './source-validation.js';
import {estimateSceneRegistration,projectSceneCameraAnchors,sceneRegistrationRecord} from './scene-registration.js';

async function submissionScope(c:pg.PoolClient,a:Actor,engine:string,value:DigitizationRegistrationReviewSubmit){
 await requireDigitizationAgency(c,a);const w=await checkedWorkspace(c,engine),x=digitizationRegistrationReviewSubmit.parse(value);
 if(w.state!=='active'||w.version!==x.workspaceVersion||w.inputRevision!==x.inputRevision)fail(409,'Reload the current workspace before sharing registration observations.','VERSION_CONFLICT');
 if(x.reviewerId===a.id)fail(403,'Choose an independent registration reviewer.','SELF_REVIEW_DENIED');
 if(!(await c.query('SELECT digitization_current_tour_reviewer($1) allowed',[x.reviewerId])).rows[0].allowed)fail(404,'A current independent reviewer is required.');
 if(!(await c.query("SELECT digitization_revision_access($1,$2,'document_processing') allowed",[engine,w.inputRevision])).rows[0].allowed)fail(403,'Current source processing authority is required.');
 const row=(await c.query('SELECT * FROM digitization_scene_registrations WHERE digitization_id=$1 ORDER BY workspace_version DESC,id DESC LIMIT 1',[engine])).rows[0];
 if(!row||row.id!==x.registrationId||row.input_revision!==w.inputRevision||row.registration.reviewRequest)fail(409,'Select the latest private registration observations.','REGISTRATION_REVISION_CONFLICT');
 if(row.created_by!==a.id)fail(403,'Only the observation author can delegate this private review.');
 const geometry=(await c.query('SELECT id,input_revision,geometry FROM geometry_revisions WHERE digitization_id=$1 ORDER BY revision DESC LIMIT 1',[engine])).rows[0];
 if(geometry?.id!==row.geometry_revision_id||geometry.input_revision!==w.inputRevision)fail(409,'The registration plan changed.','GEOMETRY_REVISION_CONFLICT');
 const artifact=(await c.query("SELECT ar.id,ar.version,ar.checksum FROM artifacts ar JOIN processing_stages s ON s.id=ar.stage_id WHERE ar.id=$1 AND ar.digitization_id=$2 AND ar.input_revision=$3 AND ar.status='private' AND ar.format='application/octet-stream' AND ar.quality_report->>'kind'='splat_viewer_tier' AND ar.quality_report->>'encoding'='splat32-wxyz-v1' AND s.state='succeeded' AND s.stage_type='scene_export'",[row.scene_artifact_id,engine,w.inputRevision])).rows[0];
 if(!artifact)fail(404,'Current private exported scene tier not found.');
 const sources=(await c.query('SELECT source_set FROM property_input_revisions WHERE digitization_id=$1 AND revision=$2',[engine,w.inputRevision])).rows[0]?.source_set??[];
 if(!sources.length||(await c.query("SELECT count(*)::int n FROM media_assets WHERE id=ANY($1::uuid[]) AND owner_id=$2 AND status='approved' AND scan_at IS NOT NULL AND visibility='private'",[sources.map((s:any)=>s.assetId),a.id])).rows[0].n!==sources.length)fail(403,'This delegation only shares your own current source-derived scene and plan. Obtain explicit owner review authority for other sources.');
 const registration=sceneRegistrationRecord(row,w.version);
 if(!registration.cameraAnchors.length)fail(422,'Record observed camera positions before requesting navigation review.');
 const observations=digitizationSceneRegistrationCreate.parse({version:w.version,inputRevision:w.inputRevision,sceneArtifactId:artifact.id,geometryRevisionId:geometry.id,floorId:row.floor_id,anchors:row.anchors,cameraAnchors:registration.cameraAnchors.map(({planPosition:_position,...camera})=>camera),note:row.note});
 const estimate=estimateSceneRegistration(observations),cameras=projectSceneCameraAnchors(observations,digitizationGeometryRevision.parse(geometry.geometry));
 if(JSON.stringify(estimate.sceneToPlan)!==JSON.stringify(registration.sceneToPlan)||cameras.some((camera,index)=>JSON.stringify(camera.planPosition)!==JSON.stringify(registration.cameraAnchors[index].planPosition)))fail(422,'The stored observations no longer produce this transform or camera placement.','REGISTRATION_TRANSFORM_INVALID');
 return {x,w,row,artifact,sources};
}
export async function prepareRegistrationReview(a:Actor,engine:string,value:DigitizationRegistrationReviewSubmit){
 const before=await transaction(a,c=>submissionScope(c,a,engine,value));await verifyRegistrationSources(a,engine,before.w.inputRevision,before.sources);await readPrivateSceneTier(a,engine,before.artifact.id);return before;
}
async function verifyRegistrationSources(a:Actor,engine:string,inputRevision:number,sources:any[]){for(const source of sources){const verified=await verifySmallDigitizationSource(a,engine,source.assetId,source.assetVersion,inputRevision,source.purpose);if(verified.sha256!==source.sha256||String(verified.bytes)!==source.bytes||verified.detectedMime!==source.detectedMime)fail(409,'A delegated scene or plan source changed. Reprocess its current revision.','SOURCE_CONTENT_CHANGED');}}
export function registrationReviewApproval(row:any){const {kind:_kind,...snapshot}=row.snapshot;return digitizationRegistrationReviewApproval.parse({id:row.id,version:row.version,inputRevision:row.input_revision,decision:row.decision,reason:row.reason,...snapshot});}
export function registrationReviewRequest(context:any){const row=context.request;return digitizationRegistrationReviewRequest.parse({id:row.id,version:1,workspaceVersion:row.workspace_version+1,digitizationId:row.digitization_id,observationRegistrationId:row.registration.observationRegistrationId,reviewerId:row.registration.reviewerId,current:true,registration:sceneRegistrationRecord(row,row.workspace_version+1),decision:context.approval?.decision??null});}
export async function registrationSubmissionReplay(c:pg.PoolClient,a:Actor,engine:string,req:FastifyRequest,input:DigitizationRegistrationReviewSubmit){
 const key=req.headers['idempotency-key'];if(typeof key!=='string'||!(await c.query('SELECT 1 FROM idempotency WHERE actor_id=$1 AND key=$2',[a.id,key])).rowCount)return null;
 await requireDigitizationAgency(c,a);const w=await checkedWorkspace(c,engine);if(w.state!=='active'||w.inputRevision!==input.inputRevision)fail(409,'The delegated registration source scope changed.');
 const result=await idempotent<{data:ReturnType<typeof registrationReviewRequest>}>(c,a,req,input,async()=>fail(409,'The registration receipt changed.'));
 const context=(await c.query('SELECT digitization_registration_review_context($1) context',[result.data.id])).rows[0].context,q=context.request;
 if(q.created_by!==a.id||q.digitization_id!==engine||q.workspace_version!==input.workspaceVersion||q.registration.observationRegistrationId!==input.registrationId||q.registration.reviewerId!==input.reviewerId)fail(403,'The registration receipt is outside the current delegated scope.');
 return result;
}
export async function submitRegistrationReview(c:pg.PoolClient,a:Actor,engine:string,prepared:Awaited<ReturnType<typeof prepareRegistrationReview>>){
 const fresh=await submissionScope(c,a,engine,prepared.x);if(JSON.stringify(fresh)!==JSON.stringify(prepared))fail(409,'The registration or source scope changed during preparation.');
 if((await c.query('SELECT count(*)::int n FROM digitization_scene_registrations WHERE digitization_id=$1',[engine])).rows[0].n>=1000)fail(429,'Private registration capacity reached.');
 const payload={...fresh.row.registration,reviewRequest:true,previewDelegationConfirmed:true,reviewerId:fresh.x.reviewerId,observationRegistrationId:fresh.row.id,sceneArtifactVersion:fresh.artifact.version,sceneArtifactChecksum:fresh.artifact.checksum};
 const row=(await c.query(`INSERT INTO digitization_scene_registrations(digitization_id,organization_id,created_by,workspace_version,input_revision,scene_artifact_id,geometry_revision_id,floor_id,anchors,metres_per_scene_unit,registration,note) SELECT digitization_id,organization_id,$2,$3,input_revision,scene_artifact_id,geometry_revision_id,floor_id,anchors,metres_per_scene_unit,$4,note FROM digitization_scene_registrations WHERE id=$1 RETURNING *`,[fresh.row.id,a.id,fresh.w.version,payload])).rows[0];
 await c.query('UPDATE property_digitizations SET version=version+1 WHERE id=$1',[engine]);
 await event(c,a,engine,'digitization.registration_review_requested',{registrationReviewId:row.id,observationRegistrationId:fresh.row.id});
 return registrationReviewRequest({request:row,approval:null});
}
export async function registrationReviewContext(a:Actor,id:string){return transaction(a,async c=>(await c.query('SELECT digitization_registration_review_context($1) context',[id])).rows[0].context);}
export async function verifyRegistrationReview(a:Actor,id:string){const before=await registrationReviewContext(a,id);await verifyRegistrationSources(before.author,before.request.digitization_id,before.request.input_revision,before.sources);await readPrivateSceneTier(before.author,before.request.digitization_id,before.request.scene_artifact_id);const after=await registrationReviewContext(a,id);if(JSON.stringify(before)!==JSON.stringify(after))fail(409,'The delegated registration changed during scene verification.');return after;}
export async function delegatedRegistrationScene(a:Actor,id:string){const before=await registrationReviewContext(a,id),body=await readPrivateSceneTier(before.author,before.request.digitization_id,before.request.scene_artifact_id);if(JSON.stringify(await registrationReviewContext(a,id))!==JSON.stringify(before))fail(409,'Registration review access changed.');return body;}
export async function delegatedRegistrationPlan(a:Actor,id:string){const before=await registrationReviewContext(a,id),body=await readGeometryPng(before.author,before.request.digitization_id,before.request.floor_id);if(JSON.stringify(await registrationReviewContext(a,id))!==JSON.stringify(before))fail(409,'Registration review access changed.');return body;}
export async function readRegistrationNavigation(c:pg.PoolClient,a:Actor,engine:string,artifactId:string){
 await requireDigitizationAgency(c,a);const w=await checkedWorkspace(c,engine);
 const row=(await c.query("SELECT id FROM digitization_scene_registrations WHERE digitization_id=$1 AND input_revision=$2 AND scene_artifact_id=$3 AND registration->'reviewRequest'='true'::jsonb AND digitization_registration_review_current(id) ORDER BY workspace_version DESC,id DESC LIMIT 1",[engine,w.inputRevision,artifactId])).rows[0];
 if(!row)return null;const context=(await c.query('SELECT digitization_registration_review_context($1) context',[row.id])).rows[0].context;
 if(context.approval?.decision!=='approved')return null;
 const approval=registrationReviewApproval(context.approval),registration=sceneRegistrationRecord(context.request,w.version);
 return digitizationRegistrationNavigation.parse({approvalId:approval.id,registrationReviewId:row.id,sceneArtifactId:artifactId,geometryRevisionId:registration.geometryRevisionId,floorId:registration.floorId,cameraAnchors:registration.cameraAnchors.filter(camera=>approval.cameraIds.includes(camera.id)),sceneToPlan:registration.sceneToPlan,scaleStatus:'estimated',privateNavigationApproved:true,metricMeasurementsAvailable:false,publiclyServed:false});
}
