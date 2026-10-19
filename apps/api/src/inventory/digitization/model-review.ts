import type pg from 'pg';
import {createHash} from 'node:crypto';
import {event,type Actor} from '@haven/database';
import {digitizationGeometryRevision,digitizationModelReviewCreate,digitizationModelReviewDecision,digitizationModelReviewApproval,digitizationModelReviewRequest} from '@haven/contracts';
import {fail,transaction} from '../../platform/core.js';
import {checkedWorkspace,requireDigitizationAgency} from './intakes.js';
import {verifySmallDigitizationSource} from './source-validation.js';
import {readPrivateSceneTier} from './scene-preview.js';
import {prepareStructuralPublicDerivative} from './structural-projection.js';

function approvalRecord(row:any){return row?digitizationModelReviewApproval.parse({id:row.id,version:row.version,decision:row.decision,reason:row.reason,reviewerId:row.created_by,requestId:row.snapshot.modelReviewRequestId,modelType:row.snapshot.modelType,candidateChecksum:row.snapshot.candidateChecksum,metricMeasurementsAvailable:false,publiclyServed:false}):null;}
export function modelReviewRecord(context:any){const q=context.request;return digitizationModelReviewRequest.parse({id:q.id,version:q.version,workspaceVersion:q.workspace_version,inputRevision:q.input_revision,modelType:q.model_type,reviewerId:q.reviewer_id,createdBy:q.created_by,createdAt:new Date(q.created_at).toISOString(),candidateChecksum:q.candidate_checksum,sourceCount:q.sources.length,scaleStatus:q.model_type==='structural'?'estimated':'unscaled',metricMeasurementsAvailable:false,publiclyServed:false,current:true,approval:approvalRecord(context.approval)});}
async function originalSources(author:Actor,engine:string,inputRevision:number,sources:any[]){
 for(const source of sources){
  if(!['document','plan','photo','panorama','video'].includes(source.purpose))fail(422,'This source needs its capture-specific verification port.','MODEL_SOURCE_PROFILE_UNAVAILABLE');
  const checked=await verifySmallDigitizationSource(author,engine,source.assetId,source.assetVersion,inputRevision,source.purpose);
  if(checked.sha256!==source.sha256||String(checked.bytes)!==source.bytes||checked.detectedMime!==source.detectedMime)fail(409,'The model source bytes changed.','MODEL_SOURCE_CHANGED');
 }
}
async function submissionScope(c:pg.PoolClient,a:Actor,engine:string,x:ReturnType<typeof digitizationModelReviewCreate.parse>){
 await requireDigitizationAgency(c,a);const workspace=await checkedWorkspace(c,engine);
 if(workspace.version!==x.workspaceVersion||workspace.inputRevision!==x.inputRevision)fail(409,'Model inputs changed. Reload before sharing.','MODEL_REVIEW_CHANGED');
 if(x.reviewerId===a.id||!(await c.query('SELECT digitization_current_tour_reviewer($1) allowed',[x.reviewerId])).rows[0].allowed)fail(422,'Choose an independent current reviewer.','MODEL_REVIEWER_REQUIRED');
 const sources=(await c.query('SELECT source_set FROM property_input_revisions WHERE digitization_id=$1 AND revision=$2',[engine,x.inputRevision])).rows[0]?.source_set;
 if(!sources?.length)fail(422,'Attach a current verified source before sharing.','MODEL_SOURCE_REQUIRED');
 const authorized=(await c.query("SELECT bool_and(digitization_model_source_authority($1,$2,(source->>'assetId')::uuid,(source->>'assetVersion')::integer,$3,'model_review')) allowed FROM jsonb_array_elements($4::jsonb) source",[a.id,engine,x.inputRevision,JSON.stringify(sources)])).rows[0].allowed;
 if(authorized!==true)fail(403,'The source owner must separately consent to this private model review.','MODEL_SOURCE_CONSENT_REQUIRED');
 let geometry=null,scene=null;
 if(x.modelType==='structural'){
  const row=(await c.query('SELECT id,geometry,created_by FROM geometry_revisions WHERE digitization_id=$1 ORDER BY revision DESC LIMIT 1',[engine])).rows[0];
  if(!row||row.id!==x.geometryRevisionId||row.created_by!==a.id)fail(409,'Select the current authored geometry.','MODEL_GEOMETRY_CHANGED');
  geometry=digitizationGeometryRevision.parse(row.geometry);
 }else{
  scene=(await c.query("SELECT id,version,checksum,byte_size::text FROM artifacts WHERE id=$1 AND digitization_id=$2 AND input_revision=$3 AND created_by=$4 AND status='private'",[x.sceneArtifactId,engine,x.inputRevision,a.id])).rows[0];
  if(!scene)fail(404,'Current private scene not found.');
 }
 return {workspace,sources,geometry,scene};
}
export async function prepareModelReview(a:Actor,engine:string,value:unknown){
 const x=digitizationModelReviewCreate.parse(value),scope=await transaction(a,c=>submissionScope(c,a,engine,x));
 await originalSources(a,engine,x.inputRevision,scope.sources);
 let candidate:ReturnType<typeof prepareStructuralPublicDerivative>|null=null;
 if(x.modelType==='structural'){try{candidate=prepareStructuralPublicDerivative(scope.geometry!);}catch{fail(422,'Supply a scaled plan with supported room heights before requesting structural review.','MODEL_GEOMETRY_PROFILE_UNAVAILABLE');}}
 if(x.modelType==='splat')await readPrivateSceneTier(a,engine,x.sceneArtifactId);
 return {x,scope,checksum:candidate?.sha256??scope.scene.checksum};
}
export async function submitModelReview(c:pg.PoolClient,a:Actor,engine:string,prepared:Awaited<ReturnType<typeof prepareModelReview>>){
 const {x,scope,checksum}=prepared;
 if(JSON.stringify(await submissionScope(c,a,engine,x))!==JSON.stringify(scope))fail(409,'Model scope changed during source verification.','MODEL_REVIEW_CHANGED');
 if((await c.query('SELECT count(*)::int n FROM digitization_model_review_requests WHERE digitization_id=$1',[engine])).rows[0].n>=1000)fail(429,'Private model review capacity reached.');
 const row=(await c.query(`INSERT INTO digitization_model_review_requests(digitization_id,organization_id,created_by,reviewer_id,input_revision,workspace_version,model_type,geometry_revision_id,geometry_snapshot,scene_artifact_id,scene_artifact_version,scene_artifact_checksum,candidate_checksum,processing_profile,sources,preview_delegation_confirmed) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,true) RETURNING id`,[engine,a.orgId,a.id,x.reviewerId,x.inputRevision,x.workspaceVersion,x.modelType,scope.geometry?.id??null,scope.geometry,scope.scene?.id??null,scope.scene?.version??null,scope.scene?.checksum??null,checksum,x.modelType==='structural'?'structural-public-v1':'splat-public-v1',JSON.stringify(scope.sources)])).rows[0];
 await event(c,a,engine,'digitization.model_review_requested',{reviewId:row.id,modelType:x.modelType});
 return modelReviewRecord((await c.query('SELECT digitization_model_review_context($1) context',[row.id])).rows[0].context);
}
async function context(a:Actor,id:string){return transaction(a,async c=>(await c.query('SELECT digitization_model_review_context($1) context',[id])).rows[0].context);}
async function candidateBytes(value:any){const q=value.request;const body=q.model_type==='structural'?prepareStructuralPublicDerivative(digitizationGeometryRevision.parse(q.geometry_snapshot)).body:await readPrivateSceneTier(value.author,q.digitization_id,q.scene_artifact_id);return body;}
export async function verifyModelReview(a:Actor,id:string){
 const before=await context(a,id);await originalSources(before.author,before.request.digitization_id,before.request.input_revision,before.request.sources);
 const body=await candidateBytes(before);
 if(createHash('sha256').update(body).digest('hex')!==before.request.candidate_checksum)fail(409,'The review candidate bytes changed.','MODEL_CANDIDATE_CHANGED');
 if(JSON.stringify(await context(a,id))!==JSON.stringify(before))fail(409,'Model review scope changed.','MODEL_REVIEW_CHANGED');
 return {context:before,body};
}
export async function readModelReview(a:Actor,id:string){return modelReviewRecord(await context(a,id));}
export async function modelReviewQueue(c:pg.PoolClient){return (await c.query('SELECT digitization_model_review_queue() contexts')).rows[0].contexts.map(modelReviewRecord);}
export async function readModelReviewPreview(a:Actor,id:string){const verified=await verifyModelReview(a,id);return {body:verified.body,format:verified.context.request.model_type==='structural'?'model/gltf-binary':'application/octet-stream'};}
export async function decideModelReview(c:pg.PoolClient,a:Actor,id:string,value:unknown,verified:Awaited<ReturnType<typeof verifyModelReview>>){
 const x=digitizationModelReviewDecision.parse(value),before=verified.context,fresh=(await c.query('SELECT digitization_model_review_context($1) context',[id])).rows[0].context;
 if(JSON.stringify(fresh)!==JSON.stringify(before))fail(409,'The model or review changed during verification.','MODEL_REVIEW_CHANGED');
 const row=(await c.query('SELECT digitization_review_model($1,$2,$3,$4,$5,$6,$7) approval',[id,x.requestVersion,x.workspaceVersion,x.decision,x.privacyConfirmed,x.limitationsConfirmed,x.reason])).rows[0].approval;
 await event(c,a,before.request.digitization_id,'digitization.model_reviewed',{reviewId:id,approvalId:row.id,decision:x.decision});return approvalRecord(row)!;
}

export async function currentModelReviews(c:pg.PoolClient,a:Actor,engine:string){await requireDigitizationAgency(c,a);const w=await checkedWorkspace(c,engine);const rows=(await c.query('SELECT DISTINCT ON(model_type) id FROM digitization_model_review_requests WHERE digitization_id=$1 AND created_by=$2 AND workspace_version=$3 AND input_revision=$4 ORDER BY model_type,created_at DESC,id DESC',[engine,a.id,w.version,w.inputRevision])).rows;const result=[];for(const row of rows)result.push(modelReviewRecord((await c.query('SELECT digitization_model_review_context($1) context',[row.id])).rows[0].context));return result;}
