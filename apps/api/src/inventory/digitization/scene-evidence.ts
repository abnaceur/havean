import type pg from 'pg';
import type {Actor} from '@haven/database';
import {digitizationSceneEvidence,digitizationTrainingResult} from '@haven/contracts';
import sharp from 'sharp';
import {fail,transaction} from '../../platform/core.js';
import {scopedSceneTiers} from './scene-preview.js';
import {readTrainingBytes} from './training-storage.js';

/** Follow this exact exported tier back to its training stage; never borrow a newer run's report. */
async function evidenceScope(c:pg.PoolClient,a:Actor,engine:string,artifactId:string){
 const [tier]=await scopedSceneTiers(c,a,engine,artifactId);if(!tier)fail(404,'Private scene tier not found.');
 const sourceId=tier.quality_report.sourceArtifactId;if(typeof sourceId!=='string')return null;
 // Indexed scoped reads keep every RLS boundary without multiplying its
 // source-authority policy across a five-table join for every render image.
 const source=(await c.query("SELECT stage_id,run_id,input_revision FROM artifacts WHERE id=$1::uuid AND digitization_id=$2 AND status='private' AND privacy_status IN('pending','passed') AND quality_report->>'kind'='splat_training_tier'",[sourceId,engine])).rows[0];
 if(!source||source.run_id!==tier.run_id||source.input_revision!==tier.input_revision)fail(404,'Scene training source not found.');
 const stage=(await c.query("SELECT run_id FROM processing_stages WHERE id=$1 AND digitization_id=$2 AND state='succeeded' AND stage_type='splat_train'",[source.stage_id,engine])).rows[0];
 if(!stage||stage.run_id!==tier.run_id)fail(404,'Scene training stage not found.');
 const rows=(await c.query(`SELECT id,object_key,checksum,byte_size::text,quality_report,format FROM artifacts
 WHERE stage_id=$1 AND digitization_id=$2 AND input_revision=$3 AND status='private' AND privacy_status IN('pending','passed')
 AND quality_report->>'kind' IN('splat_training_report','held_out_render') ORDER BY id`,[source.stage_id,engine,source.input_revision])).rows;
 const report=rows.find(r=>r.quality_report.kind==='splat_training_report');if(!report)return null;
 const parsed=digitizationTrainingResult.safeParse(report.quality_report.result);if(!parsed.success)fail(422,'Scene training evidence is invalid.');const result=parsed.data;
 if(result.datasetFingerprint!==tier.quality_report.datasetFingerprint)fail(409,'Scene training lineage changed.');
 const renders=rows.filter(r=>r.quality_report.kind==='held_out_render').map(row=>{
  const output=result.outputs.find(o=>o.kind==='held_out_render'&&o.index===row.quality_report.index);
  if(!output||output.kind!=='held_out_render'||row.format!=='image/png'||row.checksum!==output.sha256||row.byte_size!==output.byteSize||Number(row.byte_size)>2097152)fail(422,'Scene render evidence changed.');
  return {row,width:output.width,height:output.height,psnrDb:result.heldOutMetrics[result.outputs.filter(o=>o.kind==='held_out_render').findIndex(o=>o.index===output.index)]?.psnrDb??null};
 });
 return {tier,report,result,renders};
}
export async function readSceneEvidence(c:pg.PoolClient,a:Actor,engine:string,artifactId:string){
 const scope=await evidenceScope(c,a,engine,artifactId);if(!scope)return null;
 const {result,renders}=scope;return digitizationSceneEvidence.parse({iterations:result.iterations,elapsedSeconds:result.elapsedSeconds,splatCount:result.splatCount,fallbacks:result.fallbacks,renders:renders.map(r=>({id:r.row.id,width:r.width,height:r.height,psnrDb:r.psnrDb})),roomCoverage:null,scaleStatus:'unscaled',reviewRequired:true});
}
export async function readSceneEvidenceImage(a:Actor,engine:string,artifactId:string,renderId:string){
 const current=async(c:pg.PoolClient)=>{const scope=await evidenceScope(c,a,engine,artifactId),render=scope?.renders.find(r=>r.row.id===renderId);if(!scope||!render)fail(404,'Scene render not found.');return {tier:scope.tier,report:scope.report,render};};
 const descriptor=await transaction(a,current),body=await readTrainingBytes(descriptor.render.row,engine);
 const meta=await sharp(body,{limitInputPixels:1024*1024,failOn:'warning'}).metadata();if(meta.format!=='png'||meta.width!==descriptor.render.width||meta.height!==descriptor.render.height)fail(422,'Scene render dimensions changed.');
 await transaction(a,async c=>{if(JSON.stringify(await current(c))!==JSON.stringify(descriptor))fail(409,'Scene render authority changed.');});return body;
}
