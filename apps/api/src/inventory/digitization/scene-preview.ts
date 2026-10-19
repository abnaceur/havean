import {createHash} from 'node:crypto';
import {GetObjectCommand} from '@aws-sdk/client-s3';
import type pg from 'pg';
import type {Actor} from '@haven/database';
import {inspectSplat,SPLAT_PREVIEW_LIMIT,digitizationTrainingResult,digitizationCapturePreviewView} from '@haven/contracts';
import {fail,transaction} from '../../platform/core.js';
import {captureStorage} from './multipart.js';
import {readWorkspace,requireDigitizationAgency} from './intakes.js';
import {currentTrainingInput} from './training-input.js';
import {capturePreviewFromArchive,calibratedCapturePreview} from './capture-preview-view.js';
import {readTrainingBytes} from './training-storage.js';

export async function scopedSceneTiers(c:pg.PoolClient,a:Actor,engine:string,artifactId?:string){
 await requireDigitizationAgency(c,a);const workspace=await readWorkspace(c,engine);
 return (await c.query(`SELECT ar.id,ar.version,ar.stage_id,ar.run_id,ar.input_revision,ar.checksum,ar.byte_size::text,ar.object_key,ar.quality_report FROM artifacts ar JOIN processing_stages s ON s.id=ar.stage_id WHERE ar.digitization_id=$1 AND ar.input_revision=$2 AND ar.status='private' AND ar.privacy_status IN ('pending','passed') AND ar.format='application/octet-stream' AND ar.quality_report->>'kind'='splat_viewer_tier' AND ar.quality_report->>'encoding'='splat32-wxyz-v1' AND s.state='succeeded' AND s.stage_type='scene_export' AND ($3::uuid IS NULL OR ar.id=$3) ORDER BY ar.created_at DESC,ar.byte_size DESC,ar.id LIMIT 20`,[engine,workspace.inputRevision,artifactId??null])).rows.filter(row=>/^[a-f0-9]{64}$/.test(row.checksum)&&/^\d{1,9}$/.test(row.byte_size)&&Number(row.byte_size)>=32&&Number(row.byte_size)<=SPLAT_PREVIEW_LIMIT*32&&Number(row.byte_size)%32===0);
}
export async function privateSceneTiers(c:pg.PoolClient,a:Actor,engine:string){
 const rows=await scopedSceneTiers(c,a,engine),views=new Map<string,{initialView:ReturnType<typeof capturePreviewFromArchive>;captureViews:Array<NonNullable<ReturnType<typeof capturePreviewFromArchive>>&{id:string;label:string}>}>();
 for(const row of rows){
  const sourceId=row.quality_report.sourceArtifactId;if(typeof sourceId!=='string')continue;
  const source=(await c.query("SELECT stage_id,input_revision,input_fingerprint FROM artifacts WHERE id=$1::uuid AND digitization_id=$2 AND status='private' AND privacy_status IN('pending','passed') AND quality_report->>'kind'='splat_training_tier'",[sourceId,engine])).rows[0];if(!source)continue;
  if(!views.has(source.stage_id)){
   const input=await currentTrainingInput(c,a,engine,{id:source.stage_id,input_revision:source.input_revision,input_fingerprint:source.input_fingerprint},undefined,false);
   if(input.dataset_fingerprint!==row.quality_report.datasetFingerprint)fail(409,'Scene capture lineage changed.','SCENE_SCOPE_CHANGED');
   const body=input.captureCameras?null:await readTrainingBytes(input.archive,engine);
   if(body){const fresh=await currentTrainingInput(c,a,engine,{id:source.stage_id,input_revision:source.input_revision,input_fingerprint:source.input_fingerprint},undefined,false);
   if(JSON.stringify(fresh)!==JSON.stringify(input))fail(409,'Scene capture authority changed.','SCENE_SCOPE_CHANGED');}
   const report=(await c.query("SELECT quality_report->'result' AS result FROM artifacts WHERE stage_id=$1 AND digitization_id=$2 AND input_revision=$3 AND status='private' AND privacy_status IN('pending','passed') AND quality_report->>'kind'='splat_training_report'",[source.stage_id,engine,source.input_revision])).rows[0];
   const parsed=digitizationTrainingResult.safeParse(report?.result);
   if(!parsed.success||parsed.data.datasetFingerprint!==input.dataset_fingerprint)fail(409,'Scene training evidence changed.','SCENE_SCOPE_CHANGED');
   const evaluated=parsed.data.heldOutMetrics.filter(m=>m.psnrDb!==null).sort((a,b)=>b.psnrDb!-a.psnrDb!)[0]?.frame??parsed.data.heldOutMetrics[0]?.frame;
   const captures=parsed.data.heldOutMetrics.slice(0,24).flatMap((metric,index)=>{const camera=input.captureCameras?.find((c:{frame:string})=>c.frame===metric.frame),view=calibratedCapturePreview(camera);return view?[{...view,id:metric.frame,label:`Capture view ${index+1}`}]:[];});
   views.set(source.stage_id,{initialView:calibratedCapturePreview(input.captureCameras?.find((c:{frame:string})=>c.frame===evaluated))??(body?capturePreviewFromArchive(body,evaluated):null),captureViews:captures});
  }
  Object.assign(row,views.get(source.stage_id));
 }
 return rows.map(row=>({id:row.id,byteSize:row.byte_size,splatCount:Number(row.byte_size)/32,initialView:row.initialView?digitizationCapturePreviewView.parse(row.initialView):null,captureViews:row.captureViews??[],scaleStatus:'unscaled' as const,roomCoverage:null,reviewRequired:true as const,publiclyServed:false as const}));
}

/** Validate exact bytes and recheck live actor/source authority after transfer.
 * The caller cannot choose a bucket/key or grant publication through a URL. */
export async function readPrivateSceneTier(a:Actor,engine:string,artifactId:string){
 const current=async(c:pg.PoolClient)=>{const rows=await scopedSceneTiers(c,a,engine,artifactId);if(rows.length!==1)fail(404,'Private scene tier not found.');return rows[0];};
 const artifact=await transaction(a,current),body=await readVerifiedSceneBytes(artifact);
 await transaction(a,async c=>{if(JSON.stringify(await current(c))!==JSON.stringify(artifact))fail(409,'The scene or source authority changed.','SCENE_SCOPE_CHANGED');});
 return body;
}
/** Internal byte port: callers must derive this descriptor from a scoped SQL
 * snapshot and recheck their authority after transfer. No HTTP input supplies it. */
export async function readVerifiedSceneBytes(artifact:{object_key:string;checksum:string;byte_size:string}){
 if(!/^[a-f0-9]{64}$/.test(artifact.checksum)||!/^\d{1,9}$/.test(artifact.byte_size)||Number(artifact.byte_size)<32||Number(artifact.byte_size)>SPLAT_PREVIEW_LIMIT*32||Number(artifact.byte_size)%32!==0)fail(422,'Invalid bounded scene descriptor.','SCENE_BYTES_INVALID');
 const storage=captureStorage();let body:Buffer;
 try{
  const stored=await storage.send(new GetObjectCommand({Bucket:'haven-private',Key:artifact.object_key}),{abortSignal:AbortSignal.timeout(20000)});
  if(!stored.Body||String(stored.ContentLength)!==artifact.byte_size){(stored.Body as any)?.destroy?.();fail(422,'The scene storage does not match.','SCENE_BYTES_INVALID');}
  const chunks:Buffer[]=[];let size=0;const digest=createHash('sha256');
  for await(const chunk of stored.Body as AsyncIterable<Uint8Array>){size+=chunk.byteLength;if(size>Number(artifact.byte_size)){(stored.Body as any).destroy?.();fail(422,'The scene storage does not match.','SCENE_BYTES_INVALID');}digest.update(chunk);chunks.push(Buffer.from(chunk));}
  if(String(size)!==artifact.byte_size||digest.digest('hex')!==artifact.checksum)fail(422,'The scene checksum does not match.','SCENE_BYTES_INVALID');
  body=Buffer.concat(chunks,size);
  try{inspectSplat(Uint8Array.from(body).buffer);}catch{fail(422,'The scene encoding is invalid.','SCENE_BYTES_INVALID');}
 }finally{storage.destroy();}
 return body;
}
