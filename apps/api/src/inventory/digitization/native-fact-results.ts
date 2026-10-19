import {beginOutputWrite,finishOutputWrite} from './output-writes.js';
import {createHash} from 'node:crypto';
import {GetObjectCommand,PutObjectCommand} from '@aws-sdk/client-s3';
import type {Actor} from '@haven/database';
import {fail,transaction} from '../../platform/core.js';
import {checkedWorkspace} from './intakes.js';
import {prepareCpuExecution} from './execution-scope.js';
import {existingRenderReceipt} from './execution-results.js';
import {projectPrivateNativeDocumentFactCandidates} from './document-fact-projection.js';
import {verifySmallDigitizationSource} from './source-validation.js';
import {captureStorage} from './multipart.js';
import {completeProcessingStage} from './stage-completion.js';
import type {CpuRunnerClient} from './runner-client.js';
import {z} from 'zod';
import sharp from 'sharp';
import {projectPrivateDocumentFactCandidates} from './document-fact-projection.js';
import {documentOcrProfileAllowed,productionDocumentOcrAvailable,investigationOcrProfilesAvailable} from './ocr-configuration.js';
import {structuredSuggestions} from './structured-provider.js';

const ocrPage=z.object({page:z.number().int().min(1).max(50),sha256:z.string().regex(/^[a-f0-9]{64}$/),width:z.number().int().positive(),height:z.number().int().positive(),originalToUpright:z.array(z.number().finite()).length(9)}).superRefine((p,c)=>{const m=p.originalToUpright;if(p.width*p.height>4000000||m[6]!==0||m[7]!==0||m[8]!==1||Math.abs(m[0]*m[4]-m[1]*m[3])<1e-12)c.addIssue({code:'custom',message:'Invalid source page transform or budget'});});
async function storeObject(storage:ReturnType<typeof captureStorage>,objectKey:string,body:Buffer,mime:string,signal:AbortSignal){
 signal.throwIfAborted();
 const sha256=createHash('sha256').update(body).digest('hex');
 try{await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:objectKey,Body:body,ContentType:mime,IfNoneMatch:'*'}),{abortSignal:AbortSignal.any([signal,AbortSignal.timeout(20000)])});}
 catch(error:any){if(error.$metadata?.httpStatusCode!==412)throw error;}
 const stored=await storage.send(new GetObjectCommand({Bucket:'haven-private',Key:objectKey}),{abortSignal:AbortSignal.any([signal,AbortSignal.timeout(20000)])});
 if(!stored.Body||stored.ContentLength!==body.length){(stored.Body as any)?.destroy?.();fail(422,'Private fact storage does not match.','RESULT_OBJECT_MISMATCH');}
 let bytes=0;const hash=createHash('sha256');
 for await(const chunk of stored.Body as AsyncIterable<Uint8Array>){bytes+=chunk.byteLength;if(bytes>body.length){(stored.Body as any).destroy?.();fail(422,'Private fact storage does not match.','RESULT_OBJECT_MISMATCH');}hash.update(chunk);}
 if(bytes!==body.length||hash.digest('hex')!==sha256)fail(422,'Private fact storage does not match.','RESULT_OBJECT_MISMATCH');
}

/** Internal collection port for the already supported native-glyph profiles.
 * No new OCR admission, browser route, fact decision or inventory mutation.
 * Exact source bytes are checked outside SQL; the lease and actor scope are
 * rechecked before candidate/receipt/stage completion commit atomically. */
export async function collectNativeDocumentFacts(a:Actor,engine:string,stageId:string,executionId:string,fencingToken:string,assetId:string,client:CpuRunnerClient){
 return collectDocumentFacts(a,engine,stageId,executionId,fencingToken,assetId,client,false);
}
export async function collectDocumentOcr(a:Actor,engine:string,stageId:string,executionId:string,fencingToken:string,assetId:string,client:CpuRunnerClient){
 if(!productionDocumentOcrAvailable()&&!investigationOcrProfilesAvailable())fail(422,'OCR is unavailable.','RESULT_PROFILE_UNAVAILABLE');
 return collectDocumentFacts(a,engine,stageId,executionId,fencingToken,assetId,client,true);
}
async function collectDocumentFacts(a:Actor,engine:string,stageId:string,executionId:string,fencingToken:string,assetId:string,client:CpuRunnerClient,ocr:boolean):Promise<{executionId:string;state:'succeeded';artifactIds:string[];candidateIds:string[];requiresOcrPages:number[]}>{
 const kind=ocr?'document_ocr_candidates':'native_fact_candidates';
 const before=await transaction(a,async c=>{
  const prior=await existingRenderReceipt(c,a,engine,stageId,executionId,fencingToken,assetId);
  const workspace=await checkedWorkspace(c,engine);
  const binding=(await c.query("SELECT id,asset_version FROM digitization_asset_bindings WHERE digitization_id=$1 AND input_revision=$2 AND asset_id=$3 AND purpose='document'",[engine,workspace.inputRevision,assetId])).rows[0];
  if(!binding)fail(404,'Current private document not found.','SOURCE_NOT_FOUND');
  if(prior){
   const artifact=(await c.query("SELECT quality_report FROM artifacts WHERE stage_id=$1 AND format='application/json'",[stageId])).rows[0];
   if(!artifact||artifact.quality_report.kind!==kind||artifact.quality_report.sourceAssetId!==assetId)fail(409,'This stage has no document fact receipt.','RESULT_RECEIPT_MISSING');
   return {workspace,binding,prior,request:null,quality:artifact.quality_report};
  }
  const request=await prepareCpuExecution(c,a,engine,stageId,executionId,fencingToken,assetId);
  if(ocr?request.stageType!=='document_ocr'||!documentOcrProfileAllowed(request.profileId):request.stageType!=='fact_extract'||!/^generic-native-facts-(en|fr|ar)-v(1|3)$/.test(request.profileId))fail(422,'This command accepts its declared document profile only.','RESULT_PROFILE_UNAVAILABLE');
  return {workspace,binding,prior:null,request,quality:null};
 });
 const source=await verifySmallDigitizationSource(a,engine,assetId,before.binding.asset_version,before.workspace.inputRevision,'document');
 const expected=before.request?.artifacts[0].checksum??before.quality.sourceSha256;
 if(source.sha256!==expected)fail(409,'Stored document changed after its input snapshot.','SOURCE_CONTENT_CHANGED');
 if(before.prior)return transaction(a,async c=>{
  const prior=await existingRenderReceipt(c,a,engine,stageId,executionId,fencingToken,assetId);
  if(!prior)fail(409,'The completed fact receipt changed.','RESULT_RECEIPT_MISSING');
  return {...prior,candidateIds:before.quality.candidateIds,requiresOcrPages:before.quality.requiresOcrPages};
 });
 const request=before.request!;
 const receipt=await client.read(request);
 if(receipt.state!=='succeeded')fail(409,'Native document extraction has not completed.','RESULT_NOT_READY');
 let prepared:ReturnType<typeof projectPrivateNativeDocumentFactCandidates>;
 let pages:Array<z.infer<typeof ocrPage>>=[];
 try{if(ocr&&(receipt.result as any)?.productionOcrEnabled!==!request.profileId.includes('-investigation-'))throw Error('OCR admission profile mismatch');if(!ocr&&(receipt.result as any)?.extractionMethod!==('generic-native-glyphs-'+request.profileId.split('-')[4]))throw Error('Native profile version mismatch');const context={organizationId:a.orgId,inputRevision:request.inputRevision,target:before.workspace.target,assetId,sourceSha256:source.sha256,locale:request.profileId.split('-')[3]};prepared=ocr?{candidates:projectPrivateDocumentFactCandidates(receipt.result,context),requiresOcrPages:[],reviewRequired:true}:projectPrivateNativeDocumentFactCandidates(receipt.result,context);
  pages=z.array(ocrPage).min(1).max(50).parse((receipt.result as any).pages);if(pages.reduce((sum,p)=>sum+p.width*p.height,0)>30000000)throw Error('Page raster budget exceeded');
 }
 catch{fail(422,'The document result does not match its source and profile.','RESULT_INVALID');}
 const body=Buffer.from(JSON.stringify(receipt.result));
 if(body.length>16*1024*1024)fail(422,'The document result exceeds its byte budget.','RESULT_BUDGET_EXCEEDED');
 const sha256=createHash('sha256').update(body).digest('hex'),objectKey=`digitization/${engine}/${request.runId}/${stageId}/${executionId}/native-${sha256}.json`;
 const writer=await beginOutputWrite(a,engine,stageId,executionId,fencingToken,assetId);
 if(!writer)return collectDocumentFacts(a,engine,stageId,executionId,fencingToken,assetId,client,ocr);
 const storage=captureStorage();
 const previews:Array<{page:z.infer<typeof ocrPage>;key:string;bytes:number}>=[];
 try{
  const collected=await transaction(a,async c=>{
   // The other collector may have committed after this writer registered.
   // Receipt lookup locks the same workspace/stage/run before scope checks.
   if(await existingRenderReceipt(c,a,engine,stageId,executionId,fencingToken,assetId))return true;
   await prepareCpuExecution(c,a,engine,stageId,executionId,fencingToken,assetId);return false;
  });
  if(collected)return collectDocumentFacts(a,engine,stageId,executionId,fencingToken,assetId,client,ocr);
  const structuredEnrichment=await structuredSuggestions(prepared.candidates,request.profileId.split('-')[3] as 'en'|'fr'|'ar',writer.signal);
  await storeObject(storage,objectKey,body,'application/json',writer.signal);let total=body.length;
  for(const page of pages){writer.signal.throwIfAborted();const png=await client.preview(request,page.sha256);total+=png.length;if(total>32*1024*1024)fail(422,'Private document output exceeds its byte budget.','RESULT_BUDGET_EXCEEDED');const metadata=await sharp(png,{limitInputPixels:4000000,failOn:'warning'}).metadata();if(metadata.format!=='png'||metadata.width!==page.width||metadata.height!==page.height)fail(422,'Private document raster dimensions do not match.','RESULT_INVALID');const key=`digitization/${engine}/${request.runId}/${stageId}/${executionId}/ocr-${page.page}-${page.sha256}.png`;await storeObject(storage,key,png,'image/png',writer.signal);previews.push({page,key,bytes:png.length});}
  return await transaction(a,async c=>{
  const prior=await existingRenderReceipt(c,a,engine,stageId,executionId,fencingToken,assetId);
  if(prior){const saved=(await c.query("SELECT quality_report FROM artifacts WHERE stage_id=$1 AND format='application/json'",[stageId])).rows[0];if(saved?.quality_report.kind!==kind)fail(409,'The completed fact receipt changed.');return {...prior,candidateIds:saved.quality_report.candidateIds,requiresOcrPages:saved.quality_report.requiresOcrPages};}
  await prepareCpuExecution(c,a,engine,stageId,executionId,fencingToken,assetId);
  const fresh=await checkedWorkspace(c,engine);
  if(fresh.version!==before.workspace.version||JSON.stringify(fresh.target)!==JSON.stringify(before.workspace.target))fail(409,'The workspace changed during document collection.','VERSION_CONFLICT');
  for(const candidate of prepared.candidates)await c.query('INSERT INTO fact_candidates(id,digitization_id,organization_id,created_by,input_revision,field,candidate,extractor_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[candidate.id,engine,a.orgId,a.id,request.inputRevision,candidate.field,JSON.stringify(candidate),candidate.extractorVersion]);
  const candidateIds=prepared.candidates.map(candidate=>candidate.id).sort();
  const artifactIds:string[]=[];
  for(const preview of previews){const p=preview.page;const tokens=(receipt.result as any).ocrPages?.find((item:any)=>item.page===p.page)?.tokens??[];const artifact=(await c.query("INSERT INTO artifacts(digitization_id,organization_id,created_by,run_id,stage_id,input_revision,input_fingerprint,object_key,checksum,byte_size,format,profile_id,software_versions,quality_report) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'image/png',$11,$12,$13) RETURNING id",[engine,a.orgId,a.id,request.runId,stageId,request.inputRevision,request.inputFingerprint,preview.key,p.sha256,String(preview.bytes),request.profileId,{profile:request.profileId},{kind:ocr?'document_ocr_page':'document_native_page',page:p.page,width:p.width,height:p.height,coordinateSpace:'upright-page-normalized-top-left',originalToUpright:p.originalToUpright,sourceAssetId:assetId,sourceSha256:source.sha256,reviewRequired:true}])).rows[0];artifactIds.push(artifact.id);await c.query('INSERT INTO document_pages(digitization_id,organization_id,created_by,binding_id,input_revision,page,preview_artifact_id,orientation_transform,ocr_tokens) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[engine,a.orgId,a.id,before.binding.id,request.inputRevision,p.page,artifact.id,JSON.stringify(p.originalToUpright),JSON.stringify(tokens)]);}
  const quality={kind,sourceAssetId:assetId,sourceSha256:source.sha256,candidateIds,requiresOcrPages:prepared.requiresOcrPages,structuredEnrichment,reviewRequired:true};
  const artifact=(await c.query("INSERT INTO artifacts(digitization_id,organization_id,created_by,run_id,stage_id,input_revision,input_fingerprint,object_key,checksum,byte_size,format,profile_id,software_versions,quality_report) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'application/json',$11,$12,$13) RETURNING id",[engine,a.orgId,a.id,request.runId,stageId,request.inputRevision,request.inputFingerprint,objectKey,sha256,String(body.length),request.profileId,{profile:request.profileId},quality])).rows[0];
  artifactIds.push(artifact.id);await completeProcessingStage(c,a,engine,request.runId,stageId,executionId,fencingToken);
  return {executionId,state:'succeeded' as const,artifactIds:artifactIds.sort(),candidateIds,requiresOcrPages:prepared.requiresOcrPages};
  });
 }finally{storage.destroy();await finishOutputWrite(a,writer);}
}

// Existing internal callers retain the same guarded collection port.
export const collectInvestigationDocumentOcr=collectDocumentOcr;
