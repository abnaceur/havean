import '../support/env';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {captureStorage} from '../../apps/api/src/inventory/digitization/multipart';
import {readModelReviewPreview} from '../../apps/api/src/inventory/digitization/model-review';
import {readFileSync,writeFileSync} from 'node:fs';
import {afterAll,it,expect} from 'vitest';
import type {FastifyRequest} from 'fastify';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {Identity} from '../../apps/api/src/platform/core';
import {DigitizationModelReviewController} from '../../apps/api/src/inventory/digitization/model-review-controller';
import {DigitizationModelPublicationController} from '../../apps/api/src/inventory/digitization/model-publication-controller';
import {DigitizationPublicationController} from '../../apps/api/src/inventory/digitization/publication-controller';
import {InventoryController} from '../../apps/api/src/inventory/controller';
import {readPublicModel,readPublicModelContent} from '../../apps/api/src/inventory/digitization/model-publication';
import {readPublicTour} from '../../apps/api/src/inventory/digitization/publication';
import {authoredRegistrationFixture} from '../support/digitization-registration-geometry';
import {checkedWorkspace} from '../../apps/api/src/inventory/digitization/intakes';
const author:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']};
const reviewer:Actor={id:'00000000-0000-4000-8000-000000000008',orgId:null,roles:['moderator']};
const admin:Actor={id:'00000000-0000-4000-8000-000000000010',orgId:null,roles:['admin']};
const foreign:Actor={id:'00000000-0000-4000-8000-000000000011',orgId:'10000000-0000-4000-8000-000000000005',roles:['agency_manager']};
const requireApi=createRequire(new URL('../../apps/api/package.json',import.meta.url)),{PutObjectCommand}=requireApi('@aws-sdk/client-s3');
const identity=(a:Actor)=>({actor:async()=>a} as unknown as Identity);
const request=(url:string)=>({method:'POST',url,headers:{'idempotency-key':crypto.randomUUID()}} as unknown as FastifyRequest);
afterAll(()=>pool.end());
it.each(['structural','splat'] as const)('exact %s model publishes only through independent inventory review and withdraws without decimal changes',async modelType=>{
 for(const project of ['desktop','mobile']){
  const f=JSON.parse(readFileSync(`infra/generated/integration/scene-preview-model-publication-${modelType}-${project}.json`,'utf8'));
  const {geometry}=await authoredRegistrationFixture(author,f),w=await transaction(author,c=>checkedWorkspace(c,f.engineId));
  const authorApi=new DigitizationModelReviewController(identity(author)),reviewApi=new DigitizationModelReviewController(identity(reviewer)),publisher=new DigitizationModelPublicationController(identity(author));
  const shared=(await authorApi.submit(request('/model-review'),f.engineId,{workspaceVersion:w.version,inputRevision:1,reviewerId:reviewer.id,previewDelegationConfirmed:true,...(modelType==='structural'?{modelType,geometryRevisionId:geometry.id}:{modelType,sceneArtifactId:f.artifactId})})).data;
  const approval=(await reviewApi.review(request('/model-decision'),shared.id,{requestVersion:1,workspaceVersion:w.version,decision:'approved',privacyConfirmed:true,limitationsConfirmed:true,reason:'Authored fixture privacy review; no training accuracy or human approval claim.'})).data;
  const input={workspaceVersion:w.version,inputRevision:1,listingVersion:1,reviewRequestId:shared.id,approvalId:approval.id,approvalVersion:1 as const,publicationConsent:true as const,reason:'Independent synthetic inventory publication test'};
  expect(await readPublicModel(null,f.listingId)).toBeNull();
  await expect(readModelReviewPreview(foreign,shared.id)).rejects.toMatchObject({code:'42501'});
  await expect(new DigitizationModelPublicationController(identity(foreign)).propose(request('/foreign-model-publication'),f.engineId,input)).rejects.toMatchObject({code:'42501'});
  await expect(publisher.propose(request('/model-publication'),f.engineId,{...input,listingVersion:2})).rejects.toMatchObject({status:409});
  await expect(publisher.propose(request('/model-publication'),f.engineId,{...input,publicationConsent:false})).rejects.toBeDefined();
  const req=request('/model-publication'),receipts=await Promise.all([publisher.propose(req,f.engineId,input),publisher.propose(req,f.engineId,input)]),proposal=receipts[0].data;expect(receipts[1].data).toEqual(proposal);
  expect(await readPublicModel(null,f.listingId)).toBeNull();
  await expect(publisher.propose(request('/model-publication'),f.engineId,input)).rejects.toMatchObject({status:409});
  const decision={version:1,reason:'Independent synthetic exact model and listing authority approval',verified:true},decisionReq=request(`/api/v1/ops/revisions/${proposal.revisionId}/approve`);
  await expect(new InventoryController(identity(admin)).approveRevision(decisionReq,proposal.revisionId,decision)).rejects.toMatchObject({code:'42501'});
  await expect(new InventoryController(identity(author)).approveRevision(decisionReq,proposal.revisionId,decision)).rejects.toMatchObject({code:'42501'});
  const staff=new InventoryController(identity(reviewer));expect((await staff.approveRevision(decisionReq,proposal.revisionId,decision)).data).toEqual({approved:true});expect((await staff.approveRevision(decisionReq,proposal.revisionId,decision)).data).toEqual({approved:true});
  const model=await readPublicModel(null,f.listingId);expect(model).toMatchObject({viewerType:modelType,publicationNumber:1,metricMeasurementsAvailable:false,scaleStatus:modelType==='structural'?'estimated':'unscaled'});expect(await readPublicTour(null,f.listingId)).toBeNull();
  const serialized=JSON.stringify(model);for(const privateValue of [f.engineId,f.artifactId,f.sourceAssetId,geometry.id,author.id,author.orgId,shared.id,approval.id])expect(serialized).not.toContain(privateValue);
  const bytes=await readPublicModelContent(null,f.listingId,model!.packageId);expect(createHash('sha256').update(bytes.body).digest('hex')).toBe(model!.candidateChecksum);
  expect(await readPublicModel(null,f.foreignListingId)).toBeNull();await expect(readPublicModelContent(null,f.foreignListingId,model!.packageId)).rejects.toMatchObject({status:404});
  await transaction(foreign,async c=>{expect((await c.query('SELECT id FROM listings WHERE id=$1',[f.foreignListingId])).rowCount).toBe(1);expect((await c.query('SELECT id FROM digitization_model_review_requests WHERE id=$1',[shared.id])).rowCount).toBe(0);expect((await c.query('SELECT price::text FROM listings WHERE id=$1',[f.foreignListingId])).rows[0].price).toBe('2600000.75');});
  const sourceKey=await transaction(author,async c=>(await c.query('SELECT object_key FROM media_assets WHERE id=$1',[f.sourceAssetId])).rows[0].object_key),original=readFileSync('packages/test-support/assets/property-plan.png'),storage=captureStorage();
  try{await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:'quarantine/'+sourceKey,Body:Buffer.alloc(original.length)}));await expect(readPublicModelContent(null,f.listingId,model!.packageId)).rejects.toMatchObject({status:422});}finally{await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:'quarantine/'+sourceKey,Body:original}));storage.destroy();}
  if(modelType==='splat'){const artifactKey=await transaction(author,async c=>(await c.query('SELECT object_key FROM artifacts WHERE id=$1',[f.artifactId])).rows[0].object_key),sceneStorage=captureStorage();try{await sceneStorage.send(new PutObjectCommand({Bucket:'haven-private',Key:artifactKey,Body:Buffer.alloc(bytes.body.length)}));await expect(readPublicModelContent(null,f.listingId,model!.packageId)).rejects.toMatchObject({status:422});}finally{await sceneStorage.send(new PutObjectCommand({Bucket:'haven-private',Key:artifactKey,Body:bytes.body}));sceneStorage.destroy();}}

  await expect(readPublicModelContent(null,f.listingId,crypto.randomUUID())).rejects.toMatchObject({status:404});
  await expect(transaction(author,async c=>{await c.query("UPDATE media_assets SET status='rejected' WHERE id=$1",[f.sourceAssetId]);expect((await c.query('SELECT digitization_public_model($1) context',[f.listingId])).rows[0].context).toBeNull();throw Error('ROLLBACK_SOURCE_PROBE');})).rejects.toThrow('ROLLBACK_SOURCE_PROBE');
  await expect(transaction(author,async c=>{await c.query('UPDATE property_digitizations SET version=version+1 WHERE id=$1',[f.engineId]);expect((await c.query('SELECT digitization_public_model($1) context',[f.listingId])).rows[0].context.packageId).toBe(model!.packageId);throw Error('ROLLBACK_DRAFT_PROBE');})).rejects.toThrow('ROLLBACK_DRAFT_PROBE');
  await transaction(author,async c=>{expect((await c.query('SELECT price::text,version FROM listings WHERE id=$1',[f.listingId])).rows[0]).toMatchObject({price:'2500000.25',version:2});expect((await c.query('SELECT status FROM artifacts WHERE id=$1',[f.artifactId])).rows[0].status).toBe('private');});
  const withdrawal=new DigitizationPublicationController(identity(author));await withdrawal.revoke(request('/withdraw'),f.engineId,{workspaceVersion:w.version,packageId:model!.packageId,packageVersion:1,reason:'Synthetic publication withdrawal verification'});
  expect(await readPublicModel(null,f.listingId)).toBeNull();await expect(readPublicModelContent(null,f.listingId,model!.packageId)).rejects.toMatchObject({status:404});
  writeFileSync(`infra/generated/integration/model-publication-${modelType}-${project}.json`,JSON.stringify({...f,geometryRevisionId:geometry.id,workspaceVersion:w.version,reviewId:shared.id,approvalId:approval.id})+'\n');
 }
});
