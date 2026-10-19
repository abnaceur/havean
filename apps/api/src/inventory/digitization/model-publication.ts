import {createHash} from 'node:crypto';
import type pg from 'pg';
import {event,type Actor} from '@haven/database';
import {digitizationGeometryRevision,digitizationModelPublicationCreate,digitizationPublicModel} from '@haven/contracts';
import {transaction,fail} from '../../platform/core.js';
import {submitListingRevision} from '../revisions.js';
import {digitizationListingAccess} from '../property-access.js';
import {requireDigitizationAgency,checkedWorkspace} from './intakes.js';
import {verifyModelReview} from './model-review.js';
import {prepareStructuralPublicDerivative} from './structural-projection.js';
import {readVerifiedSceneBytes} from './scene-preview.js';
import {verifySmallDigitizationSource} from './source-validation.js';

export async function prepareModelPublication(a:Actor,engine:string,value:unknown){
 const x=digitizationModelPublicationCreate.parse(value),verified=await verifyModelReview(a,x.reviewRequestId);
 const scope=await transaction(a,async c=>{await requireDigitizationAgency(c,a);const w=await checkedWorkspace(c,engine);if(w.target.type!=='listing'||w.version!==x.workspaceVersion||w.inputRevision!==x.inputRevision)fail(409,'Current listing model inputs are required.');const listing=await digitizationListingAccess(c,a,w.target.id);if(listing.version!==x.listingVersion||listing.status!=='published')fail(409,'The public listing changed.');return {workspace:w,listing};});
 const q=verified.context.request,approval=verified.context.approval;
 if(q.digitization_id!==engine||q.created_by!==a.id||!approval||approval.id!==x.approvalId||approval.version!==x.approvalVersion||approval.decision!=='approved'||approval.snapshot.privacyConfirmed!==true||approval.snapshot.limitationsConfirmed!==true)fail(409,'Select the current independently approved exact model.');
 return {x,verified,scope};
}
export async function proposeModelPublication(c:pg.PoolClient,a:Actor,engine:string,prepared:Awaited<ReturnType<typeof prepareModelPublication>>){
 const {x,verified,scope}=prepared;await requireDigitizationAgency(c,a);const w=await checkedWorkspace(c,engine);
 if(w.version!==x.workspaceVersion||w.inputRevision!==x.inputRevision||w.target.type!=='listing'||w.target.id!==scope.listing.id)fail(409,'Model publication scope changed.');
 const fresh=(await c.query('SELECT digitization_model_review_context($1) context',[x.reviewRequestId])).rows[0].context;if(JSON.stringify(fresh)!==JSON.stringify(verified.context))fail(409,'Model approval changed during verification.');
 if((await c.query("SELECT bool_and(digitization_model_source_authority($1,$2,(source->>'assetId')::uuid,(source->>'assetVersion')::integer,$3,'model_publication')) allowed FROM jsonb_array_elements($4::jsonb) source",[a.id,engine,x.inputRevision,JSON.stringify(fresh.request.sources)])).rows[0].allowed!==true)fail(403,'The source owner must separately consent to model publication proposals.','MODEL_PUBLICATION_CONSENT_REQUIRED');
 const listing=(await c.query('SELECT id,title,price::text,version FROM listings WHERE id=$1 FOR UPDATE',[scope.listing.id])).rows[0];if(!listing||listing.version!==x.listingVersion)fail(409,'The listing changed during verification.');
 const revision=await submitListingRevision(c,a,listing.id,{title:listing.title,price:listing.price,version:x.listingVersion,reason:x.reason,digitizationPackage:{engineId:engine,approvalId:x.approvalId}});
 await c.query('INSERT INTO digitization_model_publication_proposals(digitization_id,organization_id,created_by,input_revision,workspace_version,listing_revision_id,model_review_request_id,approval_id,publication_consent_confirmed) VALUES($1,$2,$3,$4,$5,$6,$7,$8,true)',[engine,a.orgId,a.id,x.inputRevision,x.workspaceVersion,revision.id,x.reviewRequestId,x.approvalId]);
 await event(c,a,engine,'digitization.publication_proposed',{revisionId:revision.id,approvalId:x.approvalId});return {revisionId:revision.id,status:'pending' as const,version:1 as const,publiclyServed:false as const};
}
export async function verifyModelPublicationReview(a:Actor,revision:string,key?:unknown){
 const context=await transaction(a,async c=>{const replay=typeof key==='string'&&(await c.query('SELECT 1 FROM idempotency WHERE actor_id=$1 AND key=$2',[a.id,key])).rowCount;return (await c.query(`SELECT ${replay?'digitization_model_publication_receipt_context':'digitization_model_publication_review_context'}($1) context`,[revision])).rows[0].context;});
 if(context)await verifyModelReview(a,context.request.id);
}
async function publicContext(a:Actor|null,listing:string,packageId?:string){return transaction(a,async c=>(await c.query('SELECT digitization_public_model($1,$2) context',[listing,packageId??null])).rows[0].context);}
export async function readPublicModel(a:Actor|null,listing:string){const value=await publicContext(a,listing);return value?digitizationPublicModel.parse({...value.manifest,packageId:value.packageId,version:value.version,publicationNumber:value.publicationNumber,contentUrl:`/api/v1/listings/${listing}/digitization-packages/${value.packageId}/model`}):null;}
export async function readPublicModelContent(a:Actor|null,listing:string,packageId:string){
 const before=await publicContext(a,listing,packageId);if(!before)fail(404,'Approved property model not found.');
 const q=before.request;for(const source of q.sources){const verified=await verifySmallDigitizationSource(before.author,before.engineId,source.assetId,source.assetVersion,before.inputRevision,source.purpose);if(verified.sha256!==source.sha256||String(verified.bytes)!==source.bytes||verified.detectedMime!==source.detectedMime)fail(409,'Approved model source changed.');}
 const body=q.model_type==='structural'?prepareStructuralPublicDerivative(digitizationGeometryRevision.parse(q.geometry_snapshot)).body:await publishedSceneBytes(before);
 if(createHash('sha256').update(body).digest('hex')!==q.candidate_checksum)fail(409,'Approved model bytes changed.');
 if(JSON.stringify(await publicContext(a,listing,packageId))!==JSON.stringify(before))fail(404,'Approved property model access changed.');
 return {body,format:q.model_type==='structural'?'model/gltf-binary':'application/octet-stream'};
}

async function publishedSceneBytes(context:any){const q=context.request;const artifact=await transaction(context.author,async c=>{await requireDigitizationAgency(c,context.author);await checkedWorkspace(c,context.engineId);const row=(await c.query("SELECT object_key,checksum,byte_size::text FROM artifacts WHERE id=$1 AND digitization_id=$2 AND input_revision=$3 AND version=$4 AND checksum=$5 AND status='private'",[q.scene_artifact_id,context.engineId,context.inputRevision,q.scene_artifact_version,q.scene_artifact_checksum])).rows[0];if(!row)fail(404,'Approved scene snapshot not found.');return row;});return readVerifiedSceneBytes(artifact);}
