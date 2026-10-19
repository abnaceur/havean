import type {Actor} from '@haven/database';
import {event} from '@haven/database';
import type pg from 'pg';
import {digitizationPublicTour,digitizationPublicationCreate} from '@haven/contracts';
import {fail,transaction} from '../../platform/core.js';
import {submitListingRevision} from '../revisions.js';
import {checkedWorkspace,requireDigitizationAgency} from './intakes.js';
import {prepareReviewedTourInventoryChange} from './inventory-tour-preparation.js';
import {latestTourApproval,verifyTourReviewSources} from './tour-review.js';
import {readArtifactPreview} from './artifact-preview.js';
import {verifySmallDigitizationSource} from './source-validation.js';

export async function prepareReviewedTourPublication(a:Actor,engine:string,value:unknown){
 const x=digitizationPublicationCreate.parse(value),{reason,...request}=x;
 const prepared=await prepareReviewedTourInventoryChange(a,engine,request);
 // Verify the exact derived bytes too; approval of the original cannot certify
 // a missing or corrupted viewer derivative.
 for(const binding of prepared.privateBindings)await readArtifactPreview(a,engine,binding.artifactId);
 return {x,reason,prepared};
}
export async function proposeReviewedTourPublication(c:pg.PoolClient,a:Actor,engine:string,context:Awaited<ReturnType<typeof prepareReviewedTourPublication>>){
 const {x,reason,prepared}=context;
  await requireDigitizationAgency(c,a);const w=await checkedWorkspace(c,engine),approval=await latestTourApproval(c,a,engine);
  if(w.version!==x.workspaceVersion||w.inputRevision!==x.inputRevision||approval?.id!==x.approvalId)fail(409,'Publication inputs changed during preparation.');
  const listing=(await c.query('SELECT title,price::text,version FROM listings WHERE id=$1 FOR UPDATE',[prepared.listingId])).rows[0];
  if(!listing||listing.version!==x.listingVersion)fail(409,'The listing changed during preparation.');
  const revision=await submitListingRevision(c,a,prepared.listingId,{title:listing.title,price:listing.price,version:x.listingVersion,reason,digitizationPackage:{engineId:engine,approvalId:approval.id}});
  await c.query('INSERT INTO digitization_publication_proposals(digitization_id,organization_id,created_by,input_revision,workspace_version,listing_revision_id,approval_id,tour_review_request_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[engine,a.orgId,a.id,x.inputRevision,x.workspaceVersion,revision.id,approval.id,approval.tourReviewRequestId]);
  await event(c,a,engine,'digitization.publication_proposed',{revisionId:revision.id,approvalId:approval.id});
  return {revisionId:revision.id,status:'pending' as const,version:1 as const,publiclyServed:false as const};
}
export async function verifyPublicationReviewSources(a:Actor,revisionId:string,idempotencyKey?:unknown){
 const context=await transaction(a,async c=>{if(typeof idempotencyKey==='string'&&(await c.query('SELECT 1 FROM idempotency WHERE actor_id=$1 AND key=$2',[a.id,idempotencyKey])).rowCount){const scope=(await c.query('SELECT 1 FROM digitization_publication_proposals p JOIN digitization_tour_review_requests q ON q.id=p.tour_review_request_id WHERE p.listing_revision_id=$1 AND q.reviewer_id=$2 AND digitization_current_tour_reviewer($2)',[revisionId,a.id])).rowCount;if(scope)return null;}return (await c.query('SELECT digitization_publication_review_context($1) context',[revisionId])).rows[0].context;});
 if(context){await verifyTourReviewSources(a,context.request.id);for(const node of context.graph.nodes.filter((n:any)=>context.request.included_node_ids.includes(n.id)))for(const id of node.tierArtifactIds)await readArtifactPreview(context.author,context.request.digitization_id,id);}
}
async function publicContext(c:pg.PoolClient,listing:string,packageId?:string){return (await c.query('SELECT digitization_public_package($1,$2) context',[listing,packageId??null])).rows[0].context;}
function publicProjection(context:any,listing:string){
 return digitizationPublicTour.parse({...context.manifest,packageId:context.packageId,version:context.version,publicationNumber:context.publicationNumber,nodes:context.manifest.nodes.map((node:any)=>({...node,tiers:node.tiers.map((slot:string)=>({slot,url:`/api/v1/listings/${listing}/digitization-packages/${context.packageId}/nodes/${node.slot}/tiers/${slot}`}))}))});
}
export async function readPublicTour(a:Actor|null,listing:string){const context=await transaction(a,c=>publicContext(c,listing));return context?publicProjection(context,listing):null;}
export async function readPublicTourContent(a:Actor|null,listing:string,packageId:string,node:string,tier:string){
 const before=await transaction(a,c=>publicContext(c,listing,packageId));if(!before)fail(404,'Approved property tour not found.');
 const binding=before.bindings.find((b:any)=>b.nodeSlot===node&&b.tierSlot===tier);if(!binding)fail(404,'Approved property capture not found.');
 for(const source of before.sources){const verified=await verifySmallDigitizationSource(before.author,before.engineId,source.assetId,source.assetVersion,before.inputRevision,'panorama');if(verified.sha256!==source.sha256||String(verified.bytes)!==source.bytes)fail(409,'The approved capture source changed.');}
 const body=await readArtifactPreview(before.author,before.engineId,binding.artifactId);
 await transaction(a,async c=>{if(JSON.stringify(await publicContext(c,listing,packageId))!==JSON.stringify(before))fail(404,'Approved property tour access changed.');});
 return body;
}
