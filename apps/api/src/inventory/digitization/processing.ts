import {randomUUID} from 'node:crypto';
import type pg from 'pg';
import type {Actor} from '@haven/database';
import {digitizationProcessingCreate} from '@haven/contracts';
import type {z} from 'zod';
import {fail} from '../../platform/core.js';
import {checkedWorkspace,requireDigitizationAgency} from './intakes.js';
import {cpuSourceFingerprint} from './execution-scope.js';
import {createRunGraph,dispatchRunGraph} from './workflow.js';
import {documentOcrAvailable,productionDocumentOcrAvailable} from './ocr-configuration.js';

/** Browser selects a source/output. Scope, profile, fingerprint, graph and budget
 * are prepared by the API; the browser never submits execution authority. */
export async function startPrivateSourceProcessing(c:pg.PoolClient,a:Actor,engine:string,input:z.infer<typeof digitizationProcessingCreate>){
 await requireDigitizationAgency(c,a);const w=await checkedWorkspace(c,engine);
 if(w.state!=='active')fail(409,'This workspace is archived.','WORKFLOW_CONFLICT');
 if(w.version!==input.version||w.inputRevision!==input.inputRevision)fail(409,'The sources changed. Reload before processing.','INPUT_REVISION_CONFLICT');
 const sources=(await c.query('SELECT source_set FROM property_input_revisions WHERE digitization_id=$1 AND revision=$2',[engine,w.inputRevision])).rows[0]?.source_set??[];
 const matches=sources.filter((s:any)=>s.assetId===input.assetId);
 if(matches.length!==1)fail(422,'Select one unambiguous current source.','SOURCE_SELECTION_AMBIGUOUS');
 const source=matches[0];let profile:string,type:'document_ocr'|'fact_extract'|'document_rasterize'|'panorama_optimize'|'media_probe'|'frame_select';
 if(input.output==='facts'){
  const ocr=documentOcrAvailable();
  if(source.purpose!=='document'||!(ocr?['application/pdf','image/jpeg','image/png']:['application/pdf']).includes(source.detectedMime))fail(422,'Select a supported private document. Scanned information needs manual review until OCR is available.','PROFILE_UNAVAILABLE');
  profile=ocr?'private-ocr-'+(source.detectedMime==='application/pdf'?'document':'image')+'-'+input.locale+(productionDocumentOcrAvailable()?'-v1':'-investigation-v1'):'generic-native-facts-'+input.locale+'-v3';type=ocr?'document_ocr':'fact_extract';
 }else if(input.output==='plan'){
  if(!['document','plan'].includes(source.purpose)||!['application/pdf','image/jpeg','image/png'].includes(source.detectedMime))fail(422,'Select a PDF or image plan source.','PROFILE_UNAVAILABLE');
  profile=source.detectedMime==='application/pdf'?'pdfium-150dpi-v1':'upright-image-v1';type='document_rasterize';
 }else if(input.output==='frames'&&source.purpose==='photo'){
  if(!['image/jpeg','image/png'].includes(source.detectedMime)||Number(source.bytes)>10*1024*1024)fail(422,'Select a JPEG or PNG property photograph up to 10 MiB.','PROFILE_UNAVAILABLE');
  profile='private-photo-frame-v1';type='frame_select';
 }else if(input.output==='clip'||input.output==='frames'){
  if(source.purpose!=='video'||!['video/mp4','video/quicktime','video/webm'].includes(source.detectedMime)||Number(source.bytes)>10*1024*1024)fail(422,'Select a bounded private clip source.','PROFILE_UNAVAILABLE');
  profile=input.output==='clip'?'ffmpeg715-minimal-media-v1':'private-media-frames-v1';type=input.output==='clip'?'media_probe':'frame_select';
 }else{
  if(source.purpose!=='panorama'||!['image/jpeg','image/png'].includes(source.detectedMime))fail(422,'Select a genuine panorama source.','PROFILE_UNAVAILABLE');
  profile='private-panorama-candidate-v1';type='panorama_optimize';
 }
 if(input.output==='frames'){
  if(!(await c.query("SELECT digitization_asset_access($1,$2,$3,$4,'document_processing') allowed",[engine,source.assetId,source.assetVersion,w.inputRevision])).rows[0].allowed)fail(403,'Current capture authority is required.','SOURCE_ACCESS_CHANGED');
  const completed=(await c.query("SELECT id FROM processing_stages WHERE digitization_id=$1 AND input_revision=$2 AND input_fingerprint=$3 AND state='succeeded'",[engine,w.inputRevision,cpuSourceFingerprint(engine,a.orgId!,w.inputRevision,profile,source)])).rows;
  if(completed.length&&(await c.query("SELECT 1 FROM artifacts WHERE digitization_id=$1 AND stage_id=ANY($2::uuid[]) AND input_revision=$3 AND status='private' AND privacy_status IN('pending','passed') AND format='image/png' AND ((quality_report->>'width')::integer>640 OR (quality_report->>'height')::integer>640) LIMIT 1",[engine,completed.map(row=>row.id),w.inputRevision])).rowCount)fail(409,'These high-resolution capture views are already prepared.','PROCESSING_ALREADY_COMPLETE');
 }
 if((await c.query("SELECT 1 FROM processing_stages s JOIN processing_runs r ON r.id=s.run_id WHERE s.digitization_id=$1 AND s.input_revision=$2 AND s.input_fingerprint=$3 AND r.state IN('draft','queued','running') AND r.cancel_requested_at IS NULL LIMIT 1",[engine,w.inputRevision,cpuSourceFingerprint(engine,a.orgId!,w.inputRevision,profile,source)])).rowCount)fail(409,'This source is already processing.','PROCESSING_ALREADY_ACTIVE');
 const id=randomUUID();const stage={id:randomUUID(),type,state:'pending' as const,dependencies:[],profileId:profile,inputFingerprint:cpuSourceFingerprint(engine,a.orgId!,w.inputRevision,profile,source),inputRevision:w.inputRevision,attempt:0,fencingToken:null,executionId:null,progress:null};
 await createRunGraph(c,a,engine,input.version,{schemaVersion:1,id,organizationId:a.orgId!,creatorId:a.id,target:w.target,inputRevision:w.inputRevision,state:'draft',version:1,stages:[stage],deadline:new Date(Date.now()+(input.output==='frames'?1800000:300000)).toISOString(),budget:{maxSeconds:profile==='private-media-frames-v1'?240:30,maxScratchBytes:profile==='private-media-frames-v1'?'268435456':'67108864'}},[input.output==='clip'||input.output==='frames'?'gallery':input.output]);
 return {...await dispatchRunGraph(c,a,engine,id,1),inputRevision:w.inputRevision};
}
