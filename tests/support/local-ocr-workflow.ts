// One opt-in functional journey through the running development coordinator.
// Creates one clearly authored private intake; never publishes or resets data.
import './env';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {createIntake} from '../../apps/api/src/inventory/digitization/intakes';
import {appendInputRevision} from '../../apps/api/src/inventory/digitization/inputs';
import {verifySmallDigitizationSource} from '../../apps/api/src/inventory/digitization/source-validation';
import {captureStorage} from '../../apps/api/src/inventory/digitization/multipart';
import {startPrivateSourceProcessing} from '../../apps/api/src/inventory/digitization/processing';
import {developmentDocumentOcrAvailable} from '../../apps/api/src/inventory/digitization/ocr-configuration';
import {readFactReview} from '../../apps/api/src/inventory/digitization/fact-review';
import {readArtifactPreview} from '../../apps/api/src/inventory/digitization/artifact-preview';
const requireApi=createRequire(new URL('../../apps/api/package.json',import.meta.url));
const {PutObjectCommand}=requireApi('@aws-sdk/client-s3');
assert.equal(process.env.HAVEN_ENV_FILE,'.env');
assert.equal(process.env.HAVEN_CONTAINER_TESTS,'true');
assert.equal(process.env.NODE_ENV,'development');
assert.equal(developmentDocumentOcrAvailable(),true);
const actor:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']};
const storage=captureStorage();
try{
 const bytes=readFileSync('infra/generated/ocr-confined/en.png'),key=randomUUID();
 const workspace=await transaction(actor,c=>createIntake(c,actor));
 const asset=await transaction(actor,async c=>(await c.query("INSERT INTO media_assets(owner_id,object_key,mime,size,rights,visibility,purpose,status,scan_at) VALUES($1,$2,'image/png',$3,'Self-authored local OCR functional journey; no customer/property claim','private','document','approved',now()) RETURNING id,version",[actor.id,key,bytes.length])).rows[0]);
 await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key,Body:bytes}));
 const source=await verifySmallDigitizationSource(actor,workspace.id,asset.id,asset.version,1,'document');
 await transaction(actor,c=>appendInputRevision(c,actor,workspace.id,1,[source]));
 const run=await transaction(actor,c=>startPrivateSourceProcessing(c,actor,workspace.id,{version:2,inputRevision:1,assetId:asset.id,output:'facts',locale:'en'}));
 const deadline=Date.now()+60000;
 let state='queued';
 do{
  const current=await transaction(actor,async c=>(await c.query('SELECT state FROM processing_runs WHERE id=$1 AND digitization_id=$2',[run.id,workspace.id])).rows[0]);
  state=current.state;
  if(!['queued','running'].includes(state))break;
  await new Promise(resolve=>setTimeout(resolve,500));
 }while(Date.now()<deadline);
 assert.equal(state,'awaiting_review');
 const review=await transaction(actor,c=>readFactReview(c,actor,workspace.id));
 assert.equal(review.candidates.length,1);assert.equal(review.pages.length,1);
 assert.equal(review.candidates[0].field,'unitArea');
 assert.deepEqual(review.candidates[0].normalizedValue,{amount:'123.45',unit:'m2',basis:'document_unit_area'});
 assert.equal(review.candidates[0].review.status,'pending');
 assert.equal(review.candidates[0].evidence[0].assetId,asset.id);
 const enrichment=await transaction(actor,async c=>(await c.query("SELECT quality_report->'structuredEnrichment' enrichment FROM artifacts WHERE run_id=$1 AND format='application/json'",[run.id])).rows[0].enrichment);
 assert.equal(enrichment.state,'disabled');assert.deepEqual(enrichment.candidateIds,[]);
 const preview=await readArtifactPreview(actor,workspace.id,review.pages[0].artifactId);
 console.log(JSON.stringify({label:'O/P',scope:'authored local development source through real outbox/queue/worker/API/SQL/storage/OCR',workspaceId:workspace.id,runId:run.id,state,sourceSha256:source.sha256,previewSha256:createHash('sha256').update(preview).digest('hex'),pendingFacts:1,published:false,productionAdmission:false}));
}finally{storage.destroy();await pool.end();}
