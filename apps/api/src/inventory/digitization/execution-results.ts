import {createHash} from 'node:crypto';
import {GetObjectCommand,PutObjectCommand} from '@aws-sdk/client-s3';
import sharp from 'sharp';
import {z} from 'zod';
import {event,type Actor} from '@haven/database';
import {fail,transaction} from '../../platform/core.js';
import {completeProcessingStage} from './stage-completion.js';
import {checkedWorkspace,requireDigitizationAgency} from './intakes.js';
import {cpuSourceFingerprint,prepareCpuExecution} from './execution-scope.js';
import {verifySmallDigitizationSource} from './source-validation.js';
import {captureStorage} from './multipart.js';
import type {CpuRunnerClient} from './runner-client.js';
import type pg from 'pg';

const checksum=z.string().regex(/^[a-f0-9]{64}$/);
const preview=z.object({sha256:checksum,width:z.number().int().positive().max(30000000),height:z.number().int().positive().max(30000000),coordinateSpace:z.literal('upright-page-normalized-top-left'),originalToUpright:z.array(z.number().finite()).length(9)});
const pdfPage=preview.extend({page:z.number().int().positive().max(50),requiresOcr:z.boolean(),processingProfile:z.literal('pdfium-150dpi-v1'),softwareVersions:z.strictObject({pypdfium2:z.literal('5.14.0'),pypdf:z.literal('6.1.1'),pdfium:z.literal('156.0.8076.0')})});
const isolatedResult=z.object({ocrAvailable:z.literal(false),isolation:z.object({profile:z.literal('linux-landlock-seccomp-decoder-v1'),landlockAbi:z.number().int().min(6)})});

/** Accept only checksum-bound private renders. Native text/candidates, provider
 * paths and diagnostics never enter the artifact manifest or outbox payload.
 */
export async function existingRenderReceipt(c:pg.PoolClient,a:Actor,engine:string,stageId:string,executionId:string,fencingToken:string,assetId:string){
  await requireDigitizationAgency(c,a);const workspace=await checkedWorkspace(c,engine);
  const stage=(await c.query('SELECT s.*,r.created_by AS run_creator FROM processing_stages s JOIN processing_runs r ON r.id=s.run_id WHERE s.id=$1 AND s.digitization_id=$2 FOR UPDATE OF s,r',[stageId,engine])).rows[0];
  if(!stage)fail(404,'Processing stage not found.');
  if(stage.run_creator!==a.id)fail(403,'This result requires its initiating actor.','EXECUTION_SCOPE_REQUIRED');
  if(workspace.state!=='active'||stage.input_revision!==workspace.inputRevision)fail(409,'The source revision changed.','INPUT_REVISION_CONFLICT');
  if(stage.execution_id!==executionId||String(stage.fencing_token)!==fencingToken)fail(409,'The execution was replaced.','STALE_EXECUTION');
  if(stage.state!=='succeeded')return null;
  const source=(await c.query('SELECT source_set FROM property_input_revisions WHERE digitization_id=$1 AND revision=$2',[engine,stage.input_revision])).rows[0]?.source_set?.find((s:any)=>s.assetId===assetId);
  if(!source||!(await c.query("SELECT digitization_asset_access($1,$2,$3,$4,'document_processing') allowed",[engine,assetId,source.assetVersion,stage.input_revision])).rows[0].allowed)fail(403,'Current evidence processing authority is required.','SOURCE_ACCESS_CHANGED');
  if(cpuSourceFingerprint(engine,a.orgId!,stage.input_revision,stage.profile_id,source)!==stage.input_fingerprint)fail(409,'The completed execution used a different source.','INPUT_FINGERPRINT_CONFLICT');
  const artifacts=(await c.query('SELECT id FROM artifacts WHERE stage_id=$1 ORDER BY id',[stageId])).rows;
  if(!artifacts.length)fail(409,'The completed stage has no render receipt.','RESULT_RECEIPT_MISSING');
  return {executionId,state:'succeeded' as const,artifactIds:artifacts.map(row=>row.id)};
}
export function completedCpuRenderReceipt(a:Actor,engine:string,stageId:string,executionId:string,fencingToken:string,assetId:string){
 return transaction(a,c=>existingRenderReceipt(c,a,engine,stageId,executionId,fencingToken,assetId));
}
export async function collectCpuRenders(a:Actor,engine:string,stageId:string,executionId:string,fencingToken:string,assetId:string,client:CpuRunnerClient){
 const prior=await completedCpuRenderReceipt(a,engine,stageId,executionId,fencingToken,assetId);
 if(prior)return prior;
 const request=await transaction(a,c=>prepareCpuExecution(c,a,engine,stageId,executionId,fencingToken,assetId));
 if(request.stageType!=='document_rasterize')fail(422,'This command accepts source renders only.','RESULT_PROFILE_UNAVAILABLE');
 const receipt=await client.read(request);
 if(['failed_terminal','failed_retryable','cancelled'].includes(receipt.state)){
  const state=receipt.state==='failed_retryable'?'failed_retryable':'failed_terminal';
  await transaction(a,async c=>{
   await prepareCpuExecution(c,a,engine,stageId,executionId,fencingToken,assetId);
   await c.query('UPDATE processing_stages SET state=$2,version=version+1 WHERE id=$1',[stageId,state]);
   await c.query("INSERT INTO digitization_events(digitization_id,organization_id,created_by,run_id,kind,state) VALUES($1,$2,$3,$4,'digitization.stage_failed',$5)",[engine,a.orgId,a.id,request.runId,state]);
   await event(c,a,engine,'digitization.stage_failed',{runId:request.runId,stageId,executionId,state});
  });
  fail(state==='failed_retryable'?503:422,'The bounded decoder could not complete this source.',state==='failed_retryable'?'CPU_RUNNER_INTERRUPTED':'CPU_SOURCE_REJECTED');
 }
 if(receipt.state!=='succeeded')fail(409,'The decoder has not completed successfully.','RESULT_NOT_READY');
 let pages:Array<z.infer<typeof preview>&{page:number;requiresOcr:boolean;softwareVersions:Record<string,string>}>;
 try{
  if(request.profileId==='pdfium-150dpi-v1')pages=isolatedResult.extend({pages:z.array(pdfPage).min(1).max(50)}).parse(receipt.result).pages;
  else if(request.profileId==='upright-image-v1'){
   const image=isolatedResult.extend({image:preview}).parse(receipt.result).image;
   pages=[{...image,page:1,requiresOcr:true,softwareVersions:{Pillow:'11.3.0',profile:'upright-image-v1'}}];
  }else throw Error('Unsupported profile');
  if(pages.some((page,index)=>page.page!==index+1)||pages.reduce((sum,page)=>sum+page.width*page.height,0)>30000000)throw Error('Invalid raster budget');
  for(const {originalToUpright:m} of pages)if(m[6]!==0||m[7]!==0||m[8]!==1||Math.abs(m[0]*m[4]-m[1]*m[3])<1e-12)throw Error('Invalid upright transform');
 }catch{fail(422,'The decoder result does not match its approved profile.','RESULT_INVALID');}
 // Recheck actual immutable source bytes before accepting a stored decoder result.
 const binding=await transaction(a,async c=>{
  await prepareCpuExecution(c,a,engine,stageId,executionId,fencingToken,assetId);
  return (await c.query('SELECT asset_version,purpose FROM digitization_asset_bindings WHERE digitization_id=$1 AND input_revision=$2 AND asset_id=$3',[engine,request.inputRevision,assetId])).rows[0];
 });
 if(!binding)fail(404,'Current processing source not found.','SOURCE_NOT_FOUND');
 const source=await verifySmallDigitizationSource(a,engine,assetId,binding.asset_version,request.inputRevision,binding.purpose);
 if(source.sha256!==request.artifacts[0].checksum)fail(409,'Stored source changed after its input snapshot.','SOURCE_CONTENT_CHANGED');
 const storage=captureStorage(),renders:Array<{page:typeof pages[number];objectKey:string;bytes:number}>=[];let total=0;
 try{
  for(const page of pages){
   const body=await client.preview(request,page.sha256);total+=body.length;
   if(total>32*1024*1024)fail(422,'The decoder output exceeds its byte budget.','RESULT_BUDGET_EXCEEDED');
   const metadata=await sharp(body,{limitInputPixels:30000000,failOn:'warning'}).metadata();
   if(metadata.format!=='png'||metadata.width!==page.width||metadata.height!==page.height)fail(422,'The private preview dimensions do not match.','RESULT_INVALID');
   const objectKey=`digitization/${engine}/${request.runId}/${stageId}/${executionId}/${page.page}-${page.sha256}.png`;
   // Conditional creation plus content verification supports lost DB commit recovery.
   try{await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:objectKey,Body:body,ContentType:'image/png',IfNoneMatch:'*'}),{abortSignal:AbortSignal.timeout(20000)});}
   catch(error:any){if(error.$metadata?.httpStatusCode!==412)throw error;}
   const stored=await storage.send(new GetObjectCommand({Bucket:'haven-private',Key:objectKey}),{abortSignal:AbortSignal.timeout(20000)});
   if(!stored.Body||stored.ContentLength!==body.length){(stored.Body as any)?.destroy?.();fail(422,'Private render storage does not match.','RESULT_OBJECT_MISMATCH');}
   const hash=createHash('sha256');let size=0;
   for await(const chunk of stored.Body as AsyncIterable<Uint8Array>){size+=chunk.byteLength;if(size>body.length){(stored.Body as any).destroy?.();fail(422,'Private render storage does not match.','RESULT_OBJECT_MISMATCH');}hash.update(chunk);}
   if(size!==body.length||hash.digest('hex')!==page.sha256)fail(422,'Private render storage does not match.','RESULT_OBJECT_MISMATCH');
   renders.push({page,objectKey,bytes:body.length});
  }
  return await transaction(a,async c=>{
   const completed=await existingRenderReceipt(c,a,engine,stageId,executionId,fencingToken,assetId);
   if(completed)return completed;
   await prepareCpuExecution(c,a,engine,stageId,executionId,fencingToken,assetId);
   const artifactIds=[];
   for(const {page,objectKey,bytes} of renders){
    const artifact=(await c.query(`INSERT INTO artifacts(digitization_id,organization_id,created_by,run_id,stage_id,input_revision,input_fingerprint,object_key,checksum,byte_size,format,profile_id,software_versions,quality_report) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'image/png',$11,$12,$13) RETURNING id`,[engine,a.orgId,a.id,request.runId,stageId,request.inputRevision,request.inputFingerprint,objectKey,page.sha256,String(bytes),request.profileId,page.softwareVersions,{page:page.page,width:page.width,height:page.height,coordinateSpace:page.coordinateSpace,originalToUpright:page.originalToUpright,requiresOcr:page.requiresOcr}])).rows[0];
    artifactIds.push(artifact.id);
   }
   await completeProcessingStage(c,a,engine,request.runId,stageId,executionId,fencingToken);
   return {executionId,state:'succeeded' as const,artifactIds:artifactIds.sort()};
  });
 }finally{storage.destroy();}
}
