import './env';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {inspectSplat} from '../../packages/contracts/src/digitization-splat';
import {authoredRegistrationFixture} from './digitization-registration-geometry';
import {scanFile} from '../../apps/api/src/inventory/scanner';
import {createIntake,createListingDigitization,grantOwnerEvidence} from '../../apps/api/src/inventory/digitization/intakes';
import {verifySmallDigitizationSource} from '../../apps/api/src/inventory/digitization/source-validation';
import {appendInputRevision,reserveInputRevision} from '../../apps/api/src/inventory/digitization/inputs';
import {createRunGraph,dispatchRunGraph} from '../../apps/api/src/inventory/digitization/workflow';
import {leaseStage,requireCurrentExecution,renewStageLease} from '../../apps/api/src/inventory/digitization/leases';
import {completeProcessingStage} from '../../apps/api/src/inventory/digitization/stage-completion';
import {cpuSourceFingerprint} from '../../apps/api/src/inventory/digitization/execution-scope';
import {captureStorage} from '../../apps/api/src/inventory/digitization/multipart';
if(process.env.HAVEN_CONTAINER_TESTS!=='true'||process.env.HAVEN_ENV_FILE!=='.env.integration')throw Error('Isolated synthetic scene fixture only.');
const defaultActor:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']};
const requireApi=createRequire(new URL('../../apps/api/package.json',import.meta.url)),{PutObjectCommand}=requireApi('@aws-sdk/client-s3'),storage=captureStorage();
const source=readFileSync('packages/test-support/assets/property-plan.png'),bytes=readFileSync((process.env.SCENE_EXPORT_FIXTURE_DIR??'infra/generated/integration/scene-export-fixture')+'/package/desktop.splat'),decoded=inspectSplat(Uint8Array.from(bytes).buffer),checksum=createHash('sha256').update(bytes).digest('hex');
const ownerModel=process.env.DIGITIZATION_OWNER_MODEL_FIXTURE==='true',owner:Actor={id:'00000000-0000-4000-8000-000000000002',orgId:null,roles:['owner']};
if(ownerModel)await scanFile(source);
try{
 for(const project of ownerModel?['owner-model-integration-structural','owner-model-integration-splat','owner-model-desktop','owner-model-mobile','owner-model-race','owner-model-manager','owner-bootstrap-integration','owner-bootstrap-desktop','owner-bootstrap-mobile']:['desktop','mobile','anchors-desktop','anchors-mobile','registration-review-desktop','registration-review-mobile','model-publication-structural-desktop','model-publication-structural-mobile','model-publication-splat-desktop','model-publication-splat-mobile']){
  const managerId=project==='owner-model-manager'?await transaction({id:'00000000-0000-4000-8000-000000000010',orgId:null,roles:['admin']},async c=>{const id=crypto.randomUUID();await c.query("INSERT INTO profiles(id,subject,display_name,email) VALUES($1,$2,'Synthetic engine agency manager',$3)",[id,id,'engine-manager-'+id+'@example.test']);await c.query("INSERT INTO memberships(user_id,organization_id,role,status) VALUES($1,$2,'agency_manager','active')",[id,defaultActor.orgId]);return id;}):null;
  const actor:Actor=managerId?{id:managerId,orgId:defaultActor.orgId,roles:['agency_manager']}:defaultActor;
  const needsPlan=ownerModel||project.startsWith('anchors-')||project.startsWith('registration-review-')||project.startsWith('model-publication-');
  const listingTargets=(ownerModel||project.startsWith('model-publication-'))?await transaction({id:'00000000-0000-4000-8000-000000000010',orgId:null,roles:['admin']},async c=>{
   const unit=(await c.query("INSERT INTO units(community_id,organization_id,area,beds,living_rooms,baths) SELECT community_id,organization_id,'88.50',2,1,1 FROM units WHERE id='10000000-0000-4000-8000-000000001000' RETURNING id")).rows[0].id;
   const listing=(await c.query("INSERT INTO listings(unit_id,organization_id,owner_id,agent_id,slug,title,description,transaction,segment,currency,price,status) SELECT $1,organization_id,owner_id,agent_id,$2,'Synthetic reviewed model fixture','Authored CI model; no reconstruction accuracy or human approval claim','sale','residential','CNY','2500000.25','published' FROM listings WHERE id='10000000-0000-4000-8000-000000002000' RETURNING id",[unit,'model-publication-'+crypto.randomUUID()])).rows[0].id;
   await c.query("INSERT INTO listing_mandates(unit_id,organization_id,owner_id,expires_at) SELECT $1,organization_id,owner_id,now()+interval '30 days' FROM listings WHERE id=$2",[unit,listing]);
   await c.query("INSERT INTO memberships(user_id,organization_id,role,status) VALUES('00000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000005','agency_manager','active') ON CONFLICT(user_id,organization_id,role) DO UPDATE SET status='active',version=memberships.version+1");
   await c.query("INSERT INTO listing_mandates(unit_id,organization_id,owner_id,expires_at) SELECT $1,'10000000-0000-4000-8000-000000000005',owner_id,now()+interval '30 days' FROM listings WHERE id=$2",[unit,listing]);
   const foreignListingId=(await c.query("INSERT INTO listings(unit_id,organization_id,owner_id,slug,title,description,transaction,segment,currency,price,status) SELECT $1,'10000000-0000-4000-8000-000000000005',owner_id,$2,'Other synthetic model mandate','Separate agency without private evidence grants','sale','residential','CNY','2600000.75','published' FROM listings WHERE id=$3 RETURNING id",[unit,'other-model-mandate-'+crypto.randomUUID(),listing])).rows[0].id;
   if(ownerModel)await c.query("INSERT INTO owner_unit_grants(unit_id,owner_id,source,source_listing_id) VALUES($1,$2,'recorded_listing',$3)",[unit,owner.id,listing]);
   return {listingId:listing,foreignListingId};
  }):null;
  const listingId=listingTargets?.listingId??null;
  const workspace=await transaction(actor,c=>listingId?createListingDigitization(c,actor,listingId,1):createIntake(c,actor)),key=crypto.randomUUID();
  await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key,Body:source}));
  const asset=await transaction(ownerModel?owner:actor,async c=>(await c.query("INSERT INTO media_assets(owner_id,object_key,mime,size,rights,visibility,purpose,status,scan_at) VALUES($1,$2,'image/png',$3,'Authored CI property-plan pixels; no customer or GPU claim','private',$4,'approved',now()) RETURNING id,version",[ownerModel?owner.id:actor.id,key,source.length,ownerModel?'document':'floor_plan'])).rows[0]);
  if(ownerModel&&project.startsWith('owner-bootstrap-')){writeFileSync(`infra/generated/integration/scene-preview-${project}.json`,JSON.stringify({engineId:workspace.id,listingId,sourceAssetId:asset.id,foreignListingId:listingTargets?.foreignListingId})+'\n');continue;}
  if(ownerModel){await transaction(actor,c=>reserveInputRevision(c,actor,workspace.id,1));await transaction(owner,c=>grantOwnerEvidence(c,owner,workspace.id,{digitizationVersion:1,assetId:asset.id,assetVersion:asset.version,inputRevision:1,granteeId:actor.id,purposes:['preview','document_processing'],expiresAt:new Date(Date.now()+7*86400000).toISOString()}));}
  const verified=await verifySmallDigitizationSource(actor,workspace.id,asset.id,asset.version,1,'plan');await transaction(actor,c=>appendInputRevision(c,actor,workspace.id,1,[verified]));
  const rasterFingerprint=await transaction(actor,async c=>cpuSourceFingerprint(workspace.id,actor.orgId!,1,'authored-plan-fixture-v1',(await c.query('SELECT source_set FROM property_input_revisions WHERE digitization_id=$1 AND revision=1',[workspace.id])).rows[0].source_set[0]));
  const metadata=await requireApi('sharp')(source).metadata();
  const rasterStageId=crypto.randomUUID(),rasterArtifactId=crypto.randomUUID();
  const runId=crypto.randomUUID(),stageId=crypto.randomUUID(),artifactId=crypto.randomUUID(),fingerprint=createHash('sha256').update(workspace.id+checksum).digest('hex'),profile='authored-splat-export-fixture-v1';
  await transaction(actor,c=>createRunGraph(c,actor,workspace.id,2,{schemaVersion:1,id:runId,organizationId:actor.orgId!,creatorId:actor.id,target:workspace.target,inputRevision:1,state:'draft',version:1,stages:[{id:stageId,type:'scene_export',state:'pending',dependencies:[],profileId:profile,inputFingerprint:fingerprint,inputRevision:1,attempt:0,fencingToken:null,executionId:null,progress:null},...(needsPlan?[{id:rasterStageId,type:'document_rasterize' as const,state:'pending' as const,dependencies:[],profileId:'authored-plan-fixture-v1',inputFingerprint:rasterFingerprint,inputRevision:1,attempt:0,fencingToken:null,executionId:null,progress:null}]:[])],deadline:new Date(Date.now()+120000).toISOString(),budget:{maxSeconds:30,maxScratchBytes:'67108864'}},['scene']));
  await transaction(actor,c=>dispatchRunGraph(c,actor,workspace.id,runId,1));const lease=await transaction(actor,c=>leaseStage(c,actor,workspace.id,stageId,2));
  await transaction(actor,c=>renewStageLease(c,actor,workspace.id,stageId,lease.execution_id,String(lease.fencing_token)));
  const objectKey=`digitization/${workspace.id}/${runId}/${stageId}/${artifactId}.splat`;await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:objectKey,Body:bytes}));
  await transaction(actor,async c=>{
   await requireCurrentExecution(c,actor,workspace.id,stageId,lease.execution_id,String(lease.fencing_token));
   await c.query(`INSERT INTO artifacts(id,digitization_id,organization_id,created_by,run_id,stage_id,input_revision,input_fingerprint,object_key,checksum,byte_size,format,profile_id,software_versions,quality_report) VALUES($1,$2,$3,$4,$5,$6,1,$7,$8,$9,$10,'application/octet-stream',$11,$12,$13)`,[artifactId,workspace.id,actor.orgId,actor.id,runId,stageId,fingerprint,objectKey,checksum,bytes.length,profile,{exporter:'independent-splat32-v1',fixture:'authored_not_gpu_trained'},{kind:'splat_viewer_tier',encoding:'splat32-wxyz-v1',splatCount:decoded.count,sourceType:'authored_gaussians_not_reconstruction',publiclyServed:false}]);
   await completeProcessingStage(c,actor,workspace.id,runId,stageId,lease.execution_id,String(lease.fencing_token));
  });
  if(needsPlan){
   const rasterLease=await transaction(actor,c=>leaseStage(c,actor,workspace.id,rasterStageId,2));
   await transaction(actor,c=>renewStageLease(c,actor,workspace.id,rasterStageId,rasterLease.execution_id,String(rasterLease.fencing_token))); 
   const rasterKey=`digitization/${workspace.id}/${runId}/${rasterStageId}/${rasterArtifactId}.png`;
   await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:rasterKey,Body:source}));
   await transaction(actor,async c=>{
    await requireCurrentExecution(c,actor,workspace.id,rasterStageId,rasterLease.execution_id,String(rasterLease.fencing_token));
    await c.query(`INSERT INTO artifacts(id,digitization_id,organization_id,created_by,run_id,stage_id,input_revision,input_fingerprint,object_key,checksum,byte_size,format,profile_id,software_versions,quality_report) VALUES($1,$2,$3,$4,$5,$6,1,$7,$8,$9,$10,'image/png','authored-plan-fixture-v1',$11,$12)`,[rasterArtifactId,workspace.id,actor.orgId,actor.id,runId,rasterStageId,rasterFingerprint,rasterKey,createHash('sha256').update(source).digest('hex'),source.length,{fixture:'authored_plan_pixels_not_decoder_execution'},{kind:'plan_page',sourceAssetId:asset.id,page:1,width:metadata.width,height:metadata.height,coordinateSpace:'upright-page-normalized-top-left',originalToUpright:[1,0,0,0,1,0,0,0,1]}]);
    await completeProcessingStage(c,actor,workspace.id,runId,rasterStageId,rasterLease.execution_id,String(rasterLease.fencing_token));
   });
  }
  const authored=ownerModel?await authoredRegistrationFixture(actor,{engineId:workspace.id,artifactId,rasterArtifactId,sourceAssetId:asset.id}):null;
  writeFileSync(`infra/generated/integration/scene-preview-${project}.json`,JSON.stringify({engineId:workspace.id,listingId,managerId,foreignListingId:listingTargets?.foreignListingId??null,artifactId,splatCount:decoded.count,byteSize:bytes.length,rasterArtifactId:needsPlan?rasterArtifactId:null,sourceAssetId:asset.id,...(authored?{geometryRevisionId:authored.geometry.id}: {})})+'\n');
 }
 console.log(JSON.stringify({fixture:'authored_gaussians_not_gpu_training',realPrivateStorage:true,splatCount:decoded.count}));
}finally{storage.destroy();await pool.end();}
