import {createHash} from 'node:crypto';
import {GetObjectCommand,PutObjectCommand} from '@aws-sdk/client-s3';
import sharp from 'sharp';
import {z} from 'zod';
import type {Actor} from '@haven/database';
import type pg from 'pg';
import type {DigitizationExecutionRequest} from '@haven/contracts';
import {fail,transaction} from '../../platform/core.js';
import {prepareCpuExecution,cpuSourceFingerprint} from './execution-scope.js';
import {existingRenderReceipt} from './execution-results.js';
import {renewStageLease} from './leases.js';
import {completeProcessingStage} from './stage-completion.js';
import {readArtifactPreview} from './artifact-preview.js';
import {captureStorage} from './multipart.js';
import type {RevisionSource} from './revision-policy.js';
const page=z.object({page:z.number().int().min(1).max(50),width:z.number().int().positive(),height:z.number().int().positive(),coordinateSpace:z.literal('upright-page-normalized-top-left'),originalToUpright:z.array(z.number().finite()).length(9),requiresOcr:z.boolean()});
const software:Record<string,Record<string,string>>={'upright-image-v1':{Pillow:'11.3.0',profile:'upright-image-v1'},'pdfium-150dpi-v1':{pypdfium2:'5.14.0',pypdf:'6.1.1',pdfium:'156.0.8076.0'}};
const sameVersions=(actual:Record<string,string>,expected:Record<string,string>)=>Object.keys(actual).length===Object.keys(expected).length&&Object.entries(expected).every(([k,v])=>actual[k]===v);
async function candidates(c:pg.PoolClient,a:Actor,engine:string,request:DigitizationExecutionRequest,asset:string){
 await prepareCpuExecution(c,a,engine,request.stageId,request.executionId,request.fencingToken,asset);
 if(request.stageType!=='document_rasterize'||!software[request.profileId])return [];
 const source:RevisionSource=(await c.query('SELECT source_set FROM property_input_revisions WHERE digitization_id=$1 AND revision=$2',[engine,request.inputRevision])).rows[0].source_set.find((s:RevisionSource)=>s.assetId===asset);
 const rows=(await c.query(`SELECT ar.*,s.state AS stage_state FROM artifacts ar JOIN processing_stages s ON s.id=ar.stage_id WHERE ar.digitization_id=$1 AND ar.stage_id<>$2 AND ar.input_revision<=$3 AND ar.profile_id=$4 AND ar.status='private' AND ar.format='image/png' AND s.state='succeeded' AND s.stage_type='document_rasterize' ORDER BY ar.created_at DESC,ar.stage_id,ar.id LIMIT 1000`,[engine,request.stageId,request.inputRevision,request.profileId])).rows;
 const stages=new Map<string,any[]>();
 for(const row of rows){if(cpuSourceFingerprint(engine,a.orgId!,row.input_revision,request.profileId,source)!==row.input_fingerprint||!sameVersions(row.software_versions,software[request.profileId]))continue;const group=stages.get(row.stage_id)??[];group.push(row);stages.set(row.stage_id,group);}
 for(const group of stages.values()){
  const total=(await c.query('SELECT count(*)::int n FROM artifacts WHERE stage_id=$1',[group[0].stage_id])).rows[0].n;if(total!==group.length)continue;
  const parsed=group.map(row=>({row,metadata:page.safeParse(row.quality_report)}));if(parsed.some(p=>!p.metadata.success))continue;
  const sorted=parsed.sort((a,b)=>a.metadata.data!.page-b.metadata.data!.page);
  if(!sorted.length||sorted.length>50||sorted.some((p,i)=>p.metadata.data!.page!==i+1)||sorted.reduce((n,p)=>n+p.metadata.data!.width*p.metadata.data!.height,0)>30000000)continue;
  return sorted.map(p=>p.row);
 }
 return [];
}
/** Reuse reads actual checksum-bound private bytes and mints new current-revision
 * lineage. It never carries approval, source authority or another workspace's key. */
export async function tryReuseCpuRenders(a:Actor,engine:string,request:DigitizationExecutionRequest,asset:string){
 const prior=await transaction(a,c=>candidates(c,a,engine,request,asset));if(!prior.length)return null;
 const storage=captureStorage(),copies:Array<{original:any;key:string;bytes:number}>=[];let total=0;
 try{
  for(const original of prior){
   const body=await readArtifactPreview(a,engine,original.id),meta=page.parse(original.quality_report),image=await sharp(body,{limitInputPixels:30000000,failOn:'warning'}).metadata();total+=body.length;
   if(total>32*1024*1024||image.format!=='png'||image.width!==meta.width||image.height!==meta.height)fail(422,'Cached private pixels do not match their bounded lineage.','REUSE_OBJECT_INVALID');
   const key=`digitization/${engine}/${request.runId}/${request.stageId}/${request.executionId}/${meta.page}-${original.checksum}.png`;
   try{await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:key,Body:body,ContentType:'image/png',IfNoneMatch:'*'}),{abortSignal:AbortSignal.timeout(20000)});}catch(e:any){if(e.$metadata?.httpStatusCode!==412)throw e;}
   const object=await storage.send(new GetObjectCommand({Bucket:'haven-private',Key:key}),{abortSignal:AbortSignal.timeout(20000)});if(!object.Body||object.ContentLength!==body.length){(object.Body as any)?.destroy?.();fail(422,'Reused private storage does not match.','REUSE_OBJECT_INVALID');}
   const hash=createHash('sha256');let bytes=0;for await(const chunk of object.Body as AsyncIterable<Uint8Array>){bytes+=chunk.byteLength;if(bytes>body.length){(object.Body as any).destroy?.();fail(422,'Reused private storage does not match.','REUSE_OBJECT_INVALID');}hash.update(chunk);}if(bytes!==body.length||hash.digest('hex')!==original.checksum)fail(422,'Reused private storage does not match.','REUSE_OBJECT_INVALID');copies.push({original,key,bytes});
  }
  return await transaction(a,async c=>{
   const existing=await existingRenderReceipt(c,a,engine,request.stageId,request.executionId,request.fencingToken,asset);if(existing)return existing;
   const current=await candidates(c,a,engine,request,asset);if(JSON.stringify(current.map(p=>[p.id,p.version,p.checksum]))!==JSON.stringify(prior.map(p=>[p.id,p.version,p.checksum])))fail(409,'Cached source authority or lineage changed.','REUSE_CHANGED');
   await renewStageLease(c,a,engine,request.stageId,request.executionId,request.fencingToken);
   const ids=[];for(const {original,key,bytes} of copies){const row=(await c.query(`INSERT INTO artifacts(digitization_id,organization_id,created_by,run_id,stage_id,input_revision,input_fingerprint,object_key,checksum,byte_size,format,profile_id,software_versions,quality_report,reused_from_artifact_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'image/png',$11,$12,$13,$14) RETURNING id`,[engine,a.orgId,a.id,request.runId,request.stageId,request.inputRevision,request.inputFingerprint,key,original.checksum,String(bytes),request.profileId,original.software_versions,original.quality_report,original.id])).rows[0];ids.push(row.id);}
   await completeProcessingStage(c,a,engine,request.runId,request.stageId,request.executionId,request.fencingToken);return {executionId:request.executionId,state:'succeeded' as const,artifactIds:ids.sort()};
  });
 }finally{storage.destroy();}
}
