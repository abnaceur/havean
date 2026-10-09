import './env';
import {writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {createIntake,createListingDigitization,grantOwnerEvidence} from '../../apps/api/src/inventory/digitization/intakes';
import {appendInputRevision,reserveInputRevision} from '../../apps/api/src/inventory/digitization/inputs';
import {captureStorage} from '../../apps/api/src/inventory/digitization/multipart';
import {verifySmallDigitizationSource} from '../../apps/api/src/inventory/digitization/source-validation';
import {scanFile} from '../../apps/api/src/inventory/scanner';
import {createRunGraph,dispatchRunGraph} from '../../apps/api/src/inventory/digitization/workflow';
import {cpuSourceFingerprint,prepareCpuExecution} from '../../apps/api/src/inventory/digitization/execution-scope';
import {leaseStage} from '../../apps/api/src/inventory/digitization/leases';
import {startCpuExecution} from '../../apps/api/src/inventory/digitization/execution-start';
import {collectCpuRenders} from '../../apps/api/src/inventory/digitization/execution-results';
import {workerActor} from '../../apps/worker/src/processor';
import {CpuRunnerClient} from '../../apps/api/src/inventory/digitization/runner-client';
const requireApi=createRequire(new URL('../../apps/api/package.json',import.meta.url)),sharp=requireApi('sharp'),{CreateBucketCommand,PutObjectCommand}=requireApi('@aws-sdk/client-s3');
const project=process.argv[2],origin=process.env.DIGITIZATION_RUNNER_TEST_ORIGIN;
if(!['desktop','mobile','desktop-floors','mobile-floors','conflicts','reuse'].includes(project)||!origin)throw Error('Isolated real runner and declared browser project required.');
const owner:Actor={id:'00000000-0000-4000-8000-000000000002',orgId:null,roles:['owner']};
const actor:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']};
const storage=captureStorage();
try{
 // Self-authored pixels; the drawing is not an official property measurement.
 const bytes=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768"><rect width="1024" height="768" fill="#fff"/><g fill="none" stroke="#405a4e" stroke-width="5"><path d="M 64 64 H 960 V 704 H 64 Z M 512 64 V 704 M 64 384 H 960"/></g></svg>')).png().toBuffer();
 await scanFile(bytes);const key=crypto.randomUUID();let peer:Actor|undefined;let workspace;
 if(project==='conflicts'){const listing=await transaction(workerActor,async c=>{const id=crypto.randomUUID();await c.query("INSERT INTO profiles(id,subject,display_name,email) VALUES($1,$2,'Synthetic trace reviewer',$3)",[id,'trace-reviewer-'+id,id+'@example.test']);await c.query("INSERT INTO memberships(user_id,organization_id,role) VALUES($1,$2,'agency_manager')",[id,actor.orgId]);peer={id,orgId:actor.orgId,roles:['agency_manager']};return (await c.query("INSERT INTO listings(unit_id,organization_id,owner_id,agent_id,slug,title,description,transaction,segment,currency,price,status,created_by) SELECT unit_id,organization_id,owner_id,agent_id,$1,'Private trace conflict fixture','Self-authored test source only',transaction,segment,currency,price,'draft',$2 FROM listings WHERE id='10000000-0000-4000-8000-000000002000' RETURNING id,version",['trace-conflict-'+key,actor.id])).rows[0];});workspace=await transaction(actor,c=>createListingDigitization(c,actor,listing.id,listing.version));}
 else workspace=await transaction(actor,c=>createIntake(c,actor));
 try{await storage.send(new CreateBucketCommand({Bucket:'haven-private'}));}catch(e:any){if(!['BucketAlreadyExists','BucketAlreadyOwnedByYou'].includes(e.name))throw e;}
 await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key,Body:bytes}));
 const evidenceOwner=peer?owner:actor;const asset=await transaction(evidenceOwner,async c=>(await c.query("INSERT INTO media_assets(owner_id,object_key,mime,size,rights,visibility,purpose,status,scan_at) VALUES($1,$2,'image/png',$3,'Self-authored private plan editor pixels','private',$4,'approved',now()) RETURNING id,version",[evidenceOwner.id,key,bytes.length,peer||project==='reuse'?'document':'floor_plan'])).rows[0]);
 if(peer){await transaction(actor,c=>reserveInputRevision(c,actor,workspace.id,1));for(const recipient of [actor,peer])await transaction(owner,c=>grantOwnerEvidence(c,owner,workspace.id,{digitizationVersion:1,assetId:asset.id,assetVersion:asset.version,inputRevision:1,granteeId:recipient.id,purposes:['preview','document_processing'],expiresAt:new Date(Date.now()+3600000).toISOString()}));}
 const source=await verifySmallDigitizationSource(actor,workspace.id,asset.id,asset.version,1,project==='reuse'?'document':'plan');
 const input=await transaction(actor,c=>appendInputRevision(c,actor,workspace.id,1,[source]));
 const stageId=crypto.randomUUID(),runId=crypto.randomUUID(),profile='upright-image-v1',fingerprint=await transaction(actor,async c=>cpuSourceFingerprint(workspace.id,actor.orgId!,1,profile,(await c.query('SELECT source_set FROM property_input_revisions WHERE digitization_id=$1 AND revision=1',[workspace.id])).rows[0].source_set[0]));
 await transaction(actor,c=>createRunGraph(c,actor,workspace.id,2,{schemaVersion:1,id:runId,organizationId:actor.orgId!,creatorId:actor.id,target:workspace.target,inputRevision:1,state:'draft',version:1,stages:[{id:stageId,type:'document_rasterize',state:'pending',dependencies:[],profileId:profile,inputFingerprint:fingerprint,inputRevision:1,attempt:0,fencingToken:null,executionId:null,progress:null}],deadline:new Date(Date.now()+120000).toISOString(),budget:{maxSeconds:30,maxScratchBytes:'67108864'}},['plan']));
 await transaction(actor,c=>dispatchRunGraph(c,actor,workspace.id,runId,1));
 const lease=await transaction(actor,c=>leaseStage(c,actor,workspace.id,stageId,2)),client=new CpuRunnerClient(origin,Buffer.from('test-only-private-key-not-a-production-credential-0000'));
 await startCpuExecution(actor,workspace.id,stageId,lease.execution_id,String(lease.fencing_token),asset.id,client);
 const request=await transaction(actor,c=>prepareCpuExecution(c,actor,workspace.id,stageId,lease.execution_id,String(lease.fencing_token),asset.id)),deadline=Date.now()+15000;
 while((await client.read(request)).state!=='succeeded'){if(Date.now()>deadline)throw Error('Real private page fixture exceeded its bounded deadline.');await new Promise(resolve=>setTimeout(resolve,100));}
 const receipt=await collectCpuRenders(actor,workspace.id,stageId,lease.execution_id,String(lease.fencing_token),asset.id,client);
 writeFileSync(`infra/generated/integration/plan-editor-${project}.json`,JSON.stringify({engineId:workspace.id,artifactId:receipt.artifactIds[0],sourceAssetId:asset.id,bindingId:input.bindingIds[0],peer,width:1024,height:768})+'\n');
 console.log(JSON.stringify({project,privatePageCommitted:true}));
}finally{storage.destroy();await pool.end();}
