import type {Actor} from '@haven/database';
import {fail,transaction} from '../../platform/core.js';
import {checkedWorkspace,requireDigitizationAgency} from './intakes.js';
import {verifySmallDigitizationSource} from './source-validation.js';

async function verifyManifest(a:Actor,engine:string,inputRevision:number,sources:any[]){
 if(!Array.isArray(sources)||sources.length>100)fail(422,'Source manifest exceeds the inventory application budget.');
 const documents=sources.filter(source=>source.purpose==='document');
 if(!documents.length)fail(422,'A document source is required for these facts.');
 for(const source of documents){
  const verified=await verifySmallDigitizationSource(a,engine,source.assetId,source.assetVersion,inputRevision,'document');
  if(verified.sha256!==source.sha256||String(verified.bytes)!==source.bytes||verified.detectedMime!==source.detectedMime)fail(422,'Document bytes changed after confirmation. Reprocess the current document.','UNIT_SOURCE_BYTES_CHANGED');
 }
}
export async function verifyUnitApplicationSources(a:Actor,engine:string,inputRevision:number){
 const sources=await transaction(a,async c=>{
  await requireDigitizationAgency(c,a);const workspace=await checkedWorkspace(c,engine);
  if(workspace.inputRevision!==inputRevision)fail(409,'The source input revision changed.');
  return (await c.query('SELECT source_set FROM property_input_revisions WHERE digitization_id=$1 AND revision=$2',[engine,inputRevision])).rows[0]?.source_set;
 });
 await verifyManifest(a,engine,inputRevision,sources);
}
/** The reviewer never receives the author's private source context. The API
 * revalidates under persisted current author scope, then final SQL rechecks
 * reviewer independence, source versions and author authority through commit. */
export async function verifyUnitReviewSources(a:Actor,revisionId:string,idempotencyKey:unknown){
 const context=await transaction(a,async c=>{
  if(typeof idempotencyKey==='string'&&(await c.query('SELECT 1 FROM idempotency WHERE actor_id=$1 AND key=$2',[a.id,idempotencyKey])).rowCount)return null;
  const revision=(await c.query('SELECT changes FROM listing_revisions WHERE id=$1',[revisionId])).rows[0];
  if(!revision?.changes.unitFacts)return null;
  return (await c.query('SELECT digitization_inventory_review_sources($1) context',[revisionId])).rows[0].context;
 });
 if(context)await verifyManifest(context.author,context.engineId,context.inputRevision,context.sources);
}
