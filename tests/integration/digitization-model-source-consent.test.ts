import '../support/env';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {afterAll,it,expect} from 'vitest';
import type {FastifyRequest} from 'fastify';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {Identity} from '../../apps/api/src/platform/core';
import {DigitizationController} from '../../apps/api/src/inventory/digitization/controller';
import {DigitizationModelReviewController} from '../../apps/api/src/inventory/digitization/model-review-controller';
import {DigitizationModelPublicationController} from '../../apps/api/src/inventory/digitization/model-publication-controller';
import {InventoryController} from '../../apps/api/src/inventory/controller';
import {readPublicModel,readPublicModelContent} from '../../apps/api/src/inventory/digitization/model-publication';
import {checkedWorkspace} from '../../apps/api/src/inventory/digitization/intakes';
import {appendInputRevision} from '../../apps/api/src/inventory/digitization/inputs';
import {readModelReviewPreview} from '../../apps/api/src/inventory/digitization/model-review';
const author:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']};
const owner:Actor={id:'00000000-0000-4000-8000-000000000002',orgId:null,roles:['owner']};
const reviewer:Actor={id:'00000000-0000-4000-8000-000000000008',orgId:null,roles:['moderator']};
const foreign:Actor={id:'00000000-0000-4000-8000-000000000011',orgId:'10000000-0000-4000-8000-000000000005',roles:['agency_manager']};
const identity=(a:Actor)=>({actor:async()=>a} as unknown as Identity);
const request=(url:string)=>({method:'POST',url,headers:{'idempotency-key':crypto.randomUUID()}} as FastifyRequest);
afterAll(()=>pool.end());
it.each(['structural','splat'] as const)('owner %s source consent separates private review, publication, historical revocation and another mandate',async modelType=>{
 const f=JSON.parse(readFileSync(`infra/generated/integration/scene-preview-owner-model-integration-${modelType}.json`,'utf8'));
 const w=await transaction(author,c=>checkedWorkspace(c,f.engineId)),ownerApi=new DigitizationController(identity(owner)),authorApi=new DigitizationModelReviewController(identity(author));
 const share={workspaceVersion:w.version,inputRevision:1,reviewerId:reviewer.id,previewDelegationConfirmed:true as const,...(modelType==='structural'?{modelType,geometryRevisionId:f.geometryRevisionId}:{modelType,sceneArtifactId:f.artifactId})};
 await expect(authorApi.submit(request('/legacy-source-model-review'),f.engineId,share)).rejects.toMatchObject({status:403,response:{code:'MODEL_SOURCE_CONSENT_REQUIRED'}});
 const scope=(await ownerApi.sourcePermissions(request('/owner-source-permissions'),f.engineId)).data;
 expect(scope.sources).toHaveLength(1);expect(scope.sources[0].assetId).toBe(f.sourceAssetId);expect(scope.recipients.some(person=>person.id===author.id)).toBe(true);expect(scope.recipients.some(person=>person.id===foreign.id)).toBe(false);
 expect(JSON.stringify(scope)).not.toMatch(/object_key|quarantine|sha256|source_set/);
 const grantInput={digitizationVersion:w.version,assetId:f.sourceAssetId,assetVersion:1,inputRevision:1,granteeId:author.id,purposes:['preview','document_processing','model_review'],modelReviewConsentConfirmed:true as const,expiresAt:new Date(Date.now()+86400000).toISOString(),consentConfirmed:true as const};
 await expect(ownerApi.grant(request('/missing-review-opt-in'),f.engineId,{...grantInput,modelReviewConsentConfirmed:undefined})).rejects.toBeDefined();
 await expect(ownerApi.grant(request('/foreign-model-grantee'),f.engineId,{...grantInput,granteeId:foreign.id})).rejects.toMatchObject({status:404});
 const grantReq=request('/owner-model-review-grant'),grants=await Promise.all([ownerApi.grant(grantReq,f.engineId,grantInput),ownerApi.grant(grantReq,f.engineId,grantInput)]);expect(grants[0].data).toEqual(grants[1].data);
 await expect(authorApi.submit(request('/self-source-owner-review'),f.engineId,{...share,reviewerId:owner.id})).rejects.toMatchObject({status:422});
 const shared=(await authorApi.submit(request('/consented-private-model-review'),f.engineId,share)).data;
 await expect(readModelReviewPreview(foreign,shared.id)).rejects.toMatchObject({code:'42501'});
 const approval=(await new DigitizationModelReviewController(identity(reviewer)).review(request('/independent-owner-model-review'),shared.id,{requestVersion:1,workspaceVersion:w.version,decision:'approved',privacyConfirmed:true,limitationsConfirmed:true,reason:'Independent synthetic privacy and visualization review; no measured property claim.'})).data;
 const publisher=new DigitizationModelPublicationController(identity(author)),publication={workspaceVersion:w.version,inputRevision:1,listingVersion:1,reviewRequestId:shared.id,approvalId:approval.id,approvalVersion:1 as const,publicationConsent:true as const,reason:'Synthetic owner-consented model publication proposal'};
 await expect(publisher.propose(request('/review-only-publication-denied'),f.engineId,publication)).rejects.toMatchObject({status:403,response:{code:'MODEL_PUBLICATION_CONSENT_REQUIRED'}});
 const publicGrant=(await ownerApi.grant(request('/owner-publication-consent'),f.engineId,{...grantInput,purposes:[...grantInput.purposes,'model_publication'],modelPublicationConsentConfirmed:true})).data;
 const proposal=(await publisher.propose(request('/owner-consented-model-proposal'),f.engineId,publication)).data;
 expect(await readPublicModel(null,f.listingId)).toBeNull();
 expect((await new InventoryController(identity(reviewer)).approveRevision(request('/independent-owner-model-publication'),proposal.revisionId,{version:1,verified:true,reason:'Independent exact model, consent and listing authority approval'})).data).toEqual({approved:true});
 const model=await readPublicModel(null,f.listingId);expect(model).toMatchObject({viewerType:modelType,metricMeasurementsAvailable:false});
 const bytes=await readPublicModelContent(null,f.listingId,model!.packageId);expect(createHash('sha256').update(bytes.body).digest('hex')).toBe(model!.candidateChecksum);
 expect(await readPublicModel(null,f.foreignListingId)).toBeNull();
 await expect(new DigitizationController(identity(foreign)).revokeGrant(request('/foreign-consent-revocation'),f.engineId,publicGrant.id,{workspaceVersion:w.version,grantVersion:1,reason:'Unauthorized revocation attempt'})).rejects.toBeDefined();
 await expect(ownerApi.revokeGrant(request('/stale-consent-revocation'),f.engineId,publicGrant.id,{workspaceVersion:w.version,grantVersion:2,reason:'Stale revocation attempt'})).rejects.toMatchObject({status:409});
 // A new private draft does not alter the reviewed public snapshot, but the
 // owner must still be able to withdraw its historical source permission.
 await transaction(author,c=>appendInputRevision(c,author,f.engineId,w.version,[]));
 const historical=(await ownerApi.sourcePermissions(request('/historical-owner-permissions'),f.engineId)).data;
 expect(historical.inputRevision).toBe(2);expect(historical.sources).toEqual([]);expect(historical.grants.some(row=>row.id===publicGrant.id)).toBe(true);
 expect((await readPublicModel(null,f.listingId))?.packageId).toBe(model!.packageId);
 const revoke=request('/revoke-historical-publication-consent'),body={workspaceVersion:historical.workspaceVersion,grantVersion:1,reason:'Owner withdraws permission for the historical published derivative.'};
 const revoked=await ownerApi.revokeGrant(revoke,f.engineId,publicGrant.id,body);expect(revoked.data).toMatchObject({state:'revoked',version:2});expect((await ownerApi.revokeGrant(revoke,f.engineId,publicGrant.id,body)).data).toEqual(revoked.data);
 expect(await readPublicModel(null,f.listingId)).toBeNull();await expect(readPublicModelContent(null,f.listingId,model!.packageId)).rejects.toMatchObject({status:404});
 await transaction(owner,async c=>{expect((await c.query('SELECT owner_id,status,version FROM media_assets WHERE id=$1',[f.sourceAssetId])).rows[0]).toMatchObject({owner_id:owner.id,status:'approved',version:1});expect((await c.query('SELECT state FROM digitization_evidence_grants WHERE id=$1',[grants[0].data.id])).rows[0].state).toBe('active');});
 await transaction(author,async c=>{expect((await c.query('SELECT price::text FROM listings WHERE id=$1',[f.listingId])).rows[0].price).toBe('2500000.25');});
},30000);

it('owner revocation winning the source lock prevents a concurrent independent model approval',async()=>{
 const f=JSON.parse(readFileSync('infra/generated/integration/scene-preview-owner-model-race.json','utf8')),w=await transaction(author,c=>checkedWorkspace(c,f.engineId));
 const ownerApi=new DigitizationController(identity(owner)),grant=(await ownerApi.grant(request('/race-review-consent'),f.engineId,{digitizationVersion:w.version,assetId:f.sourceAssetId,assetVersion:1,inputRevision:1,granteeId:author.id,purposes:['preview','document_processing','model_review'],modelReviewConsentConfirmed:true,expiresAt:new Date(Date.now()+86400000).toISOString(),consentConfirmed:true})).data;
 const shared=(await new DigitizationModelReviewController(identity(author)).submit(request('/race-private-model'),f.engineId,{workspaceVersion:w.version,inputRevision:1,reviewerId:reviewer.id,previewDelegationConfirmed:true,modelType:'structural',geometryRevisionId:f.geometryRevisionId})).data;
 let release!:()=>void,ready!:(pid:number)=>void;const barrier=new Promise<void>(resolve=>release=resolve),locked=new Promise<number>(resolve=>ready=resolve);
 const revocation=transaction(owner,async c=>{await checkedWorkspace(c,f.engineId);await c.query("UPDATE digitization_evidence_grants SET state='revoked',version=version+1 WHERE id=$1",[grant.id]);ready((await c.query('SELECT pg_backend_pid() pid')).rows[0].pid);await barrier;});
 const holder=await locked;
 const outcome=new DigitizationModelReviewController(identity(reviewer)).review(request('/race-independent-model-approval'),shared.id,{requestVersion:1,workspaceVersion:w.version,decision:'approved',privacyConfirmed:true,limitationsConfirmed:true,reason:'Concurrent synthetic approval must recheck the revoked owner permission'}).then(()=>({approved:true,error:null}),error=>({approved:false,error}));
 try{
  const inspect=await pool.connect();try{const until=Date.now()+10000;for(;;){const waiting=(await inspect.query('WITH RECURSIVE waiting(pid) AS (SELECT $1::integer UNION SELECT a.pid FROM pg_stat_activity a JOIN waiting w ON w.pid=ANY(pg_blocking_pids(a.pid))) SELECT count(*)::int-1 n FROM waiting',[holder])).rows[0].n;if(waiting>0)break;if(Date.now()>until)throw Error('Expected source-authority lock wait was not observed');await new Promise(resolve=>setTimeout(resolve,25));}}finally{inspect.release();}
 }finally{release();await revocation;}
 const result=await outcome;expect(result.approved).toBe(false);expect(result.error).toMatchObject({code:'40001'});
 await transaction(owner,async c=>{expect((await c.query('SELECT count(*)::int n FROM approval_records WHERE snapshot->>\'modelReviewRequestId\'=$1',[shared.id])).rows[0].n).toBe(0);expect((await c.query('SELECT state,version FROM digitization_evidence_grants WHERE id=$1',[grant.id])).rows[0]).toEqual({state:'revoked',version:2});});
},30000);

it('owner consent bootstraps only an exact reserved source and the recipient binds real scanned bytes',async()=>{
 const f=JSON.parse(readFileSync('infra/generated/integration/scene-preview-owner-bootstrap-integration.json','utf8')),ownerApi=new DigitizationController(identity(owner)),agentApi=new DigitizationController(identity(author));
 const {DigitizationInputController}=await import('../../apps/api/src/inventory/digitization/input-controller');const binder=new DigitizationInputController(identity(author));
 expect((await agentApi.delegatedSources(request('/before-owner-reservation'),f.engineId)).data.sources).toEqual([]);
 await expect(ownerApi.sourcePermissions(request('/unreserved-owner-input'),f.engineId)).rejects.toMatchObject({code:'42501'});
 await binder.reserveListing(request('/prepare-owner-first-input'),f.listingId,{version:1});
 const scope=(await ownerApi.sourcePermissions(request('/reserved-owner-input'),f.engineId)).data;expect(scope).toMatchObject({inputState:'reserved',inputRevision:1,workspaceVersion:1});expect(scope.sources.some(source=>source.assetId===f.sourceAssetId)).toBe(true);
 const grant=(await ownerApi.grant(request('/explicit-reserved-model-consent'),f.engineId,{digitizationVersion:1,inputRevision:1,assetId:f.sourceAssetId,assetVersion:1,granteeId:author.id,purposes:['preview','document_processing','model_review'],modelReviewConsentConfirmed:true,expiresAt:new Date(Date.now()+86400000).toISOString(),consentConfirmed:true})).data;
 const delegated=(await agentApi.delegatedSources(request('/exact-owner-granted-source'),f.engineId)).data;expect(delegated.sources).toHaveLength(1);expect(delegated.sources[0]).toMatchObject({assetId:f.sourceAssetId,assetVersion:1,mime:'image/png'});expect(JSON.stringify(delegated)).not.toMatch(/object_key|quarantine|sha256|source_set/);
 await expect(new DigitizationController(identity(foreign)).delegatedSources(request('/other-mandate-owner-source'),f.engineId)).rejects.toMatchObject({status:404});
 const attached=(await binder.bindListing(request('/bind-owner-granted-scanned-source'),f.listingId,{version:1,inputRevision:1,assetId:f.sourceAssetId,assetVersion:1,purpose:'plan'})).data;expect(attached).toMatchObject({version:2,inputRevision:1});
 expect((await ownerApi.sourcePermissions(request('/current-owner-input'),f.engineId)).data).toMatchObject({inputState:'current',inputRevision:1,workspaceVersion:2});expect((await agentApi.delegatedSources(request('/no-inherited-next-owner-source'),f.engineId)).data.sources).toEqual([]);
 await ownerApi.revokeGrant(request('/withdraw-first-source-consent'),f.engineId,grant.id,{workspaceVersion:2,grantVersion:1,reason:'Owner withdraws the exact first source permission after binding.'});
 expect((await agentApi.sources(request('/revoked-owner-source-list'),f.engineId)).data).toEqual([]);
},30000);

it('assigned review and public SPLAT bytes retain the actual agency manager author role',async()=>{
 const f=JSON.parse(readFileSync('infra/generated/integration/scene-preview-owner-model-manager.json','utf8')),manager:Actor={id:f.managerId,orgId:author.orgId,roles:['agency_manager']},w=await transaction(manager,c=>checkedWorkspace(c,f.engineId));
 const grant=(await new DigitizationController(identity(owner)).grant(request('/manager-owner-model-consent'),f.engineId,{digitizationVersion:w.version,inputRevision:1,assetId:f.sourceAssetId,assetVersion:1,granteeId:manager.id,purposes:['preview','document_processing','model_review','model_publication'],modelReviewConsentConfirmed:true,modelPublicationConsentConfirmed:true,expiresAt:new Date(Date.now()+86400000).toISOString(),consentConfirmed:true})).data;
 const shared=(await new DigitizationModelReviewController(identity(manager)).submit(request('/manager-private-splat-review'),f.engineId,{workspaceVersion:w.version,inputRevision:1,reviewerId:reviewer.id,previewDelegationConfirmed:true,modelType:'splat',sceneArtifactId:f.artifactId})).data;
 expect(await transaction(reviewer,async c=>(await c.query('SELECT digitization_model_review_context($1) context',[shared.id])).rows[0].context.author.roles)).toEqual(['agency_manager']);
 const privateBytes=await readModelReviewPreview(reviewer,shared.id);expect(createHash('sha256').update(privateBytes.body).digest('hex')).toBe(shared.candidateChecksum);
 const approval=(await new DigitizationModelReviewController(identity(reviewer)).review(request('/manager-independent-model-review'),shared.id,{requestVersion:1,workspaceVersion:w.version,decision:'approved',privacyConfirmed:true,limitationsConfirmed:true,reason:'Independent synthetic manager-authored model privacy and limitations review'})).data;
 const proposal=(await new DigitizationModelPublicationController(identity(manager)).propose(request('/manager-splat-publication-proposal'),f.engineId,{workspaceVersion:w.version,inputRevision:1,listingVersion:1,reviewRequestId:shared.id,approvalId:approval.id,approvalVersion:1,publicationConsent:true,reason:'Synthetic independently reviewed manager-authored SPLAT proposal'})).data;
 await new InventoryController(identity(reviewer)).approveRevision(request('/manager-splat-inventory-review'),proposal.revisionId,{version:1,verified:true,reason:'Independent synthetic current manager, owner source consent and listing authority review'});
 const model=await readPublicModel(null,f.listingId);expect(model?.viewerType).toBe('splat');expect((await readPublicModelContent(null,f.listingId,model!.packageId)).body).toEqual(privateBytes.body);
 await new DigitizationController(identity(owner)).revokeGrant(request('/withdraw-manager-publication-consent'),f.engineId,grant.id,{workspaceVersion:w.version,grantVersion:1,reason:'Withdraw the synthetic manager model source permission after verification'});
 expect(await readPublicModel(null,f.listingId)).toBeNull();
},30000);
