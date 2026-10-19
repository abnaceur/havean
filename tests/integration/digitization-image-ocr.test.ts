import '../support/env';
import {afterAll,expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {createIntake} from '../../apps/api/src/inventory/digitization/intakes';
import {appendInputRevision} from '../../apps/api/src/inventory/digitization/inputs';
import {verifySmallDigitizationSource} from '../../apps/api/src/inventory/digitization/source-validation';
import {captureStorage} from '../../apps/api/src/inventory/digitization/multipart';
import {prepareCpuExecution} from '../../apps/api/src/inventory/digitization/execution-scope';
import {startPrivateSourceProcessing} from '../../apps/api/src/inventory/digitization/processing';
import {readProcessingMetrics} from '../../apps/api/src/inventory/digitization/processing-metrics';
import {leaseStage} from '../../apps/api/src/inventory/digitization/leases';
import {startCpuExecution} from '../../apps/api/src/inventory/digitization/execution-start';
import {CpuRunnerClient} from '../../apps/api/src/inventory/digitization/runner-client';
import {collectInvestigationDocumentOcr} from '../../apps/api/src/inventory/digitization/native-fact-results';
import {readFactReview} from '../../apps/api/src/inventory/digitization/fact-review';
import {readArtifactPreview} from '../../apps/api/src/inventory/digitization/artifact-preview';
const origin=process.env.DIGITIZATION_RUNNER_TEST_ORIGIN;
const requireApi=createRequire(new URL('../../apps/api/package.json',import.meta.url));
const {PutObjectCommand,DeleteObjectCommand}=requireApi('@aws-sdk/client-s3'),sharp=requireApi('sharp');
const actor:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']};
afterAll(()=>pool.end());

it.skipIf(!origin).each(['png','jpeg'])('actual %s document OCR persists upright source-linked review',async format=>{
 const original=readFileSync('infra/generated/ocr-confined/en.png');
 const originalMetadata=await sharp(original).metadata();
 const upscale=Math.sqrt(6000000/(originalMetadata.width*originalMetadata.height));
 // The JPEG stores sideways pixels plus EXIF orientation. OCR must use the
 // upright derivative, while original-source lineage retains the JPEG hash.
 const bytes=format==='png'?original:await sharp(original).resize(Math.round(originalMetadata.width*upscale),Math.round(originalMetadata.height*upscale)).toBuffer().then((upright:Buffer)=>sharp(upright).rotate(270).jpeg({quality:95}).withMetadata({orientation:6}).toBuffer());
 const mime='image/'+format,storage=captureStorage(),key=randomUUID();
 const client=new CpuRunnerClient(origin!,Buffer.from('test-only-private-key-not-a-production-credential-0000'));
 const workspace=await transaction(actor,c=>createIntake(c,actor));
 const asset=await transaction(actor,async c=>(await c.query("INSERT INTO media_assets(owner_id,object_key,mime,size,rights,visibility,purpose,status,scan_at) VALUES($1,$2,$3,$4,'Authored document OCR format fixture','private','document','approved',now()) RETURNING id,version",[actor.id,key,mime,bytes.length])).rows[0]);
 const storedKeys:string[]=[];
 try{
  await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key,Body:bytes}));
  const source=await verifySmallDigitizationSource(actor,workspace.id,asset.id,asset.version,1,'document');
  await transaction(actor,c=>appendInputRevision(c,actor,workspace.id,1,[source]));
  vi.stubEnv('PROCESSING_DEPLOYMENT','development');
  const started=await transaction(actor,c=>startPrivateSourceProcessing(c,actor,workspace.id,{version:2,inputRevision:1,assetId:asset.id,output:'facts',locale:'en'}));
  const stageId=started.stageIds[0];
  expect((await transaction(actor,c=>readProcessingMetrics(c,actor,workspace.id))).documentOcrAvailable).toBe(true);
  const lease=await transaction(actor,c=>leaseStage(c,actor,workspace.id,stageId,2)),fence=String(lease.fencing_token);
  const request=await transaction(actor,c=>prepareCpuExecution(c,actor,workspace.id,stageId,lease.execution_id,fence,asset.id));
  if(process.env.DIGITIZATION_OCR_RELEASE_TEST==='true')expect(request.profileId).toBe('private-ocr-image-en-v1');
  await startCpuExecution(actor,workspace.id,stageId,lease.execution_id,fence,asset.id,client);
  await expect.poll(async()=>(await client.read(request)).state,{timeout:20000}).toBe('succeeded');
  const result=await collectInvestigationDocumentOcr(actor,workspace.id,stageId,lease.execution_id,fence,asset.id,client);
  storedKeys.push(...await transaction(actor,async c=>(await c.query('SELECT object_key FROM artifacts WHERE stage_id=$1',[stageId])).rows.map(row=>row.object_key)));
  expect(result.candidateIds).toHaveLength(1);
  const review=await transaction(actor,c=>readFactReview(c,actor,workspace.id));
  expect(review.pages).toHaveLength(1);expect(review.candidates).toHaveLength(1);
  expect(review.candidates[0]).toMatchObject({field:'unitArea',normalizedValue:{amount:'123.45',unit:'m2'},review:{status:'pending'}});
  expect(review.candidates[0].evidence[0]).toMatchObject({assetId:asset.id,page:1});
  const preview=await readArtifactPreview(actor,workspace.id,review.pages[0].artifactId);
  const metadata=await sharp(preview).metadata();
  if(format==='png')expect([metadata.width,metadata.height]).toEqual([originalMetadata.width,originalMetadata.height]);
  else{
   expect(metadata.width*metadata.height).toBeLessThanOrEqual(4000000);
   expect(metadata.width/metadata.height).toBeCloseTo(originalMetadata.width/originalMetadata.height,2);
  }
  expect(metadata.exif).toBeUndefined();
  const receipt=await client.read(request);
  expect(receipt.result).toMatchObject({sourceSha256:createHash('sha256').update(bytes).digest('hex'),reviewRequired:true,productionOcrEnabled:process.env.DIGITIZATION_OCR_RELEASE_TEST==='true'});
  expect((await collectInvestigationDocumentOcr(actor,workspace.id,stageId,lease.execution_id,fence,asset.id,client)).candidateIds).toEqual(result.candidateIds);
  await expect(transaction({...actor,orgId:'10000000-0000-4000-8000-000000000005'},c=>readFactReview(c,{...actor,orgId:'10000000-0000-4000-8000-000000000005'},workspace.id))).rejects.toMatchObject({status:403});
 }finally{
  vi.unstubAllEnvs();
  for(const objectKey of ['quarantine/'+key,...storedKeys])await storage.send(new DeleteObjectCommand({Bucket:'haven-private',Key:objectKey}));
  storage.destroy();
 }
},45000);
