import type pg from 'pg';
import type {Actor} from '@haven/database';
import {event} from '@haven/database';
import {digitizationFrameDatasetCreate,digitizationFrameDatasetRecord} from '@haven/contracts';
import type {z} from 'zod';
import {fail,transaction} from '../../platform/core.js';
import {checkedWorkspace,readWorkspace,requireDigitizationAgency} from './intakes.js';
import {readArtifactPreview} from './artifact-preview.js';
import {verifySmallDigitizationSource} from './source-validation.js';
import {cpuSourceFingerprint} from './execution-scope.js';
import {measureFrameQuality,selectQualityFrames,type QualityFrame} from './frame-quality.js';
type Input=z.infer<typeof digitizationFrameDatasetCreate>;
let activeAnalyses=0;
function record(row:any){return digitizationFrameDatasetRecord.parse({id:row.id,version:row.version,inputRevision:row.input_revision,createdAt:new Date(row.created_at).toISOString(),report:row.report,measuredFrames:row.frames});}
export async function frameDatasetContext(c:pg.PoolClient,a:Actor,engine:string,input:Input,lockWorkspace=true){
 await requireDigitizationAgency(c,a);const workspace=await (lockWorkspace?checkedWorkspace:readWorkspace)(c,engine);
 if(workspace.state!=='active'||workspace.version!==input.workspaceVersion||workspace.inputRevision!==input.inputRevision)fail(409,'The frame input set changed. Reload before analyzing.','FRAME_DATASET_CHANGED');
 const manifest=(await c.query('SELECT source_set FROM property_input_revisions WHERE digitization_id=$1 AND revision=$2',[engine,input.inputRevision])).rows[0]?.source_set;
 if(!Array.isArray(manifest))fail(404,'Current private frame sources not found.');
 const rows=(await c.query("SELECT a.id,a.version,a.checksum,a.profile_id,a.input_fingerprint,a.quality_report,a.stage_id FROM artifacts a WHERE a.digitization_id=$1 AND a.input_revision=$2 AND a.id=ANY($3::uuid[]) AND a.status='private' AND a.privacy_status IN('pending','passed') AND a.format='image/png' AND ((a.profile_id='private-media-frames-v1' AND a.quality_report->>'kind'='video_frame') OR (a.profile_id='private-photo-frame-v1' AND a.quality_report->>'kind'='photo_frame'))",[engine,input.inputRevision,input.frames.map(frame=>frame.artifactId)])).rows;
 // Separate indexed lookups avoid expanding the same source-access policy across
 // a three-table join for every photograph. Every table retains its RLS check.
 const stages=(await c.query("SELECT id,run_id FROM processing_stages WHERE digitization_id=$1 AND id=ANY($2::uuid[]) AND input_revision=$3 AND stage_type='frame_select' AND state='succeeded'",[engine,[...new Set(rows.map(r=>r.stage_id))],input.inputRevision])).rows;
 const runs=(await c.query("SELECT id FROM processing_runs WHERE digitization_id=$1 AND id=ANY($2::uuid[]) AND input_revision=$3 AND state IN('awaiting_review','awaiting_input','failed','partially_ready')",[engine,[...new Set(stages.map(s=>s.run_id))],input.inputRevision])).rows;
 if(rows.some(row=>!stages.some(stage=>stage.id===row.stage_id&&runs.some(run=>run.id===stage.run_id))))fail(404,'Current private decoded frames not found.');
 if(rows.length!==input.frames.length)fail(404,'Current private decoded frames not found.');
 return input.frames.map(annotation=>{
  const row=rows.find(row=>row.id===annotation.artifactId);
  if(row.version!==annotation.artifactVersion)fail(409,'A private frame changed. Reload before analyzing.','FRAME_DATASET_CHANGED');
  const photo=row.profile_id==='private-photo-frame-v1';
  const sources=manifest.filter(source=>source.purpose===(photo?'photo':'video')&&cpuSourceFingerprint(engine,a.orgId!,input.inputRevision,row.profile_id,source)===row.input_fingerprint);
  if(sources.length!==1||row.quality_report.timestampBasis!==(photo?'still_image_no_timestamp':'decoded_input_pts'))fail(422,'Exact decoded photo or clip lineage is required.','FRAME_DATASET_INVALID');
  return {annotation,row,source:sources[0]};
 });
}
export async function analyzeFrameDataset(a:Actor,engine:string,input:Input){
 if(activeAnalyses>=2)fail(429,'Private frame analysis is busy. Retry shortly.','FRAME_DATASET_BUDGET_EXCEEDED');
 activeAnalyses++;const deadline=Date.now()+180000;
 const remaining=()=>{if(Date.now()>deadline)fail(422,'This frame dataset exceeds the bounded analysis time. Analyze fewer frames.','FRAME_DATASET_BUDGET_EXCEEDED');};
 try{
 const context=await transaction(a,c=>frameDatasetContext(c,a,engine,input));
 const sources=new Map(context.map(frame=>[frame.source.assetId,frame.source]));
 async function verifySources(){
 for(const source of sources.values()){
  remaining();const current=await verifySmallDigitizationSource(a,engine,source.assetId,source.assetVersion,input.inputRevision,source.purpose);
  if(current.sha256!==source.sha256)fail(409,'A capture source changed after decoding.','SOURCE_CONTENT_CHANGED');
 }
 }
 await verifySources();
 const measured:QualityFrame[]=[];
 for(const frame of context){
  remaining();const quality=await measureFrameQuality(await readArtifactPreview(a,engine,frame.row.id));
  if(quality.sha256!==frame.row.checksum||quality.width!==frame.row.quality_report.width||quality.height!==frame.row.quality_report.height)fail(409,'A private frame changed during analysis.','FRAME_DATASET_CHANGED');
  measured.push({artifactId:frame.row.id,cameraGroupId:frame.source.assetId,roomId:frame.annotation.roomId,transition:frame.annotation.transition,timestampSeconds:frame.row.quality_report.timestampSeconds,quality});
 }
 // Canonical ordering preserves decoded chronology within each exact source clip.
 measured.sort((a,b)=>a.cameraGroupId.localeCompare(b.cameraGroupId)||Number(a.timestampSeconds)-Number(b.timestampSeconds)||a.artifactId.localeCompare(b.artifactId));
 const report=selectQualityFrames(measured);
 await verifySources();
 remaining();return {context,measured,report};
 }finally{activeAnalyses--;}
}
export async function commitFrameDataset(c:pg.PoolClient,a:Actor,engine:string,input:Input,prepared:Awaited<ReturnType<typeof analyzeFrameDataset>>){
 const fresh=await frameDatasetContext(c,a,engine,input);
 if(JSON.stringify(fresh)!==JSON.stringify(prepared.context))fail(409,'Frame authority changed during analysis.','FRAME_DATASET_CHANGED');
 const count=(await c.query('SELECT count(*)::int n FROM digitization_frame_datasets WHERE digitization_id=$1 AND created_by=$2',[engine,a.id])).rows[0].n;
 if(count>=1000)fail(429,'Private frame report capacity reached.','FRAME_DATASET_BUDGET_EXCEEDED');
 const frames=prepared.measured.map(frame=>({...frame,artifactVersion:input.frames.find(annotation=>annotation.artifactId===frame.artifactId)!.artifactVersion,annotationBasis:'user_supplied_unverified'}));
 const row=(await c.query('INSERT INTO digitization_frame_datasets(digitization_id,organization_id,created_by,workspace_version,input_revision,frames,report) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[engine,a.orgId,a.id,input.workspaceVersion,input.inputRevision,JSON.stringify(frames),JSON.stringify(prepared.report)])).rows[0];
 await event(c,a,engine,'digitization.frame_dataset_created',{datasetId:row.id,inputRevision:input.inputRevision,selectedFrameCount:prepared.report.selectedFrameCount});
 return record(row);
}
export async function latestFrameDataset(c:pg.PoolClient,a:Actor,engine:string){
 await requireDigitizationAgency(c,a);const workspace=await readWorkspace(c,engine);
 const row=(await c.query('SELECT * FROM digitization_frame_datasets WHERE digitization_id=$1 AND input_revision=$2 ORDER BY created_at DESC,id DESC LIMIT 1',[engine,workspace.inputRevision])).rows[0];return row?record(row):null;
}

/** Only successful current photo/video derivatives enter capture selection. Reruns do not duplicate views. */
export async function frameCandidates(c:pg.PoolClient,a:Actor,engine:string){
 await requireDigitizationAgency(c,a);const workspace=await readWorkspace(c,engine);
 let rows=(await c.query(`SELECT DISTINCT ON(ar.input_fingerprint,ar.quality_report->>'timestampSeconds') ar.id,ar.version,ar.quality_report,ar.stage_id
 FROM artifacts ar
 WHERE ar.digitization_id=$1 AND ar.input_revision=$2 AND ar.status='private' AND ar.privacy_status IN('pending','passed') AND ar.format='image/png'

 AND ((ar.profile_id='private-media-frames-v1' AND ar.quality_report->>'kind'='video_frame') OR (ar.profile_id='private-photo-frame-v1' AND ar.quality_report->>'kind'='photo_frame'))
 ORDER BY ar.input_fingerprint,ar.quality_report->>'timestampSeconds',ar.created_at DESC,ar.id LIMIT 601`,[engine,workspace.inputRevision])).rows;
 if(rows.length>600)fail(422,'This source set exceeds 600 candidate views. Use a smaller capture set.','FRAME_DATASET_BUDGET_EXCEEDED');
 const successful=(await c.query("SELECT id FROM processing_stages WHERE digitization_id=$1 AND input_revision=$2 AND id=ANY($3::uuid[]) AND stage_type='frame_select' AND state='succeeded'",[engine,workspace.inputRevision,[...new Set(rows.map(row=>row.stage_id))]])).rows;
 rows=rows.filter(row=>successful.some(stage=>stage.id===row.stage_id));
 // Reuse exact source-fingerprint and live revision validation before exposing a candidate.
 const context=rows.length?await frameDatasetContext(c,a,engine,{workspaceVersion:workspace.version,inputRevision:workspace.inputRevision,frames:rows.map(r=>({artifactId:r.id,artifactVersion:r.version,roomId:null,transition:false}))},false):[];
 return {workspaceVersion:workspace.version,inputRevision:workspace.inputRevision,frames:rows.map(r=>({artifactId:r.id,cameraGroupId:context.find(frame=>frame.row.id===r.id)!.source.assetId,artifactVersion:r.version,kind:r.quality_report.kind,width:r.quality_report.width,height:r.quality_report.height,timestampSeconds:r.quality_report.kind==='photo_frame'?null:r.quality_report.timestampSeconds}))};
}
