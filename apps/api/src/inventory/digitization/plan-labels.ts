import {z} from 'zod';
import type {Actor} from '@haven/database';
import type {digitizationPlanPageSelection} from '@haven/contracts';
import {fail,transaction} from '../../platform/core.js';
import {checkedWorkspace,requireDigitizationAgency} from './intakes.js';
import {readArtifactPreview} from './artifact-preview.js';
import {verifySmallDigitizationSource} from './source-validation.js';
import {mapPlanPoint} from './plan-page.js';

type Selection=z.infer<typeof digitizationPlanPageSelection>;
const normalizedPoint=z.tuple([z.number().finite().min(0).max(1),z.number().finite().min(0).max(1)]);
const tokens=z.array(z.strictObject({text:z.string().min(1).max(2000),score:z.number().finite().min(0).max(1),polygon:z.array(normalizedPoint).length(4)})).max(5000);
/** Literal source transcriptions only. No inferred room type, boundaries,
 * calibrated confidence or approval is produced from native model scores. */
export function proposePlanLabels(value:unknown,selection:Selection){
 return tokens.parse(value).flatMap((token,index)=>{
  if(!token.text.trim()||token.text.length>80||/[\p{Cc}\p{Cf}]/u.test(token.text))return [];
  const polygon=token.polygon.map(([x,y])=>mapPlanPoint(selection.uprightToModel,{x:x*selection.uprightWidth,y:y*selection.uprightHeight}));
  const area=polygon.reduce((sum,p,i)=>{const next=polygon[(i+1)%4];return sum+p.x*next.y-next.x*p.y;},0);
  if(Math.abs(area)<1e-8)return [];
  return [{id:'label-'+index,text:token.text,polygon,confirmed:false as const}];
 }).slice(0,200);
}
/** Reuse only a persisted OCR page for the same current original and orientation.
 * This never starts OCR or admits an investigation profile into production. */
export async function readPlanLabels(a:Actor,engine:string,selection:Selection){
 async function current(){return transaction(a,async c=>{
  await requireDigitizationAgency(c,a);const workspace=await checkedWorkspace(c,engine);
  if(workspace.state!=='active'||workspace.version!==selection.workspaceVersion||workspace.inputRevision!==selection.inputRevision)fail(409,'Reload the current source page before requesting labels.','VERSION_CONFLICT');
  const row=(await c.query(`SELECT p.ocr_tokens,p.preview_artifact_id,p.orientation_transform,ocr.quality_report->>'sourceSha256' source_sha256,b.asset_version,plan.quality_report->'originalToUpright' plan_orientation
   FROM document_pages p JOIN digitization_asset_bindings b ON b.id=p.binding_id AND b.digitization_id=p.digitization_id
   JOIN artifacts ocr ON ocr.id=p.preview_artifact_id AND ocr.digitization_id=p.digitization_id AND ocr.input_revision=p.input_revision AND ocr.status='private'
   JOIN artifacts plan ON plan.id=$4 AND plan.digitization_id=p.digitization_id AND plan.input_revision=p.input_revision AND plan.status='private'
   JOIN processing_stages stage ON stage.id=ocr.stage_id AND stage.state='succeeded' AND stage.stage_type='document_ocr'
   WHERE p.digitization_id=$1 AND p.input_revision=$2 AND b.asset_id=$3 AND b.purpose='document' AND p.page=$5
   ORDER BY stage.created_at DESC,ocr.id DESC LIMIT 1`,[engine,selection.inputRevision,selection.source.assetId,selection.artifactId,selection.source.page])).rows[0];
  return row??null;
 });}
 const before=await current();
 if(!before||JSON.stringify(before.orientation_transform)!==JSON.stringify(before.plan_orientation)||!before.ocr_tokens.length)return [];
 let labels;try{labels=proposePlanLabels(before.ocr_tokens,selection);}catch{fail(422,'The source text exceeds its label profile.','PLAN_LABEL_RECEIPT_INVALID');}
 if(!labels.length)return [];
 const source=await verifySmallDigitizationSource(a,engine,selection.source.assetId,before.asset_version,selection.inputRevision,'document');
 if(source.sha256!==before.source_sha256)fail(422,'The source text belongs to different original bytes.','PLAN_LABEL_SOURCE_CHANGED');
 await readArtifactPreview(a,engine,before.preview_artifact_id);
 if(JSON.stringify(await current())!==JSON.stringify(before))fail(409,'The source text changed. Reload the plan.','VERSION_CONFLICT');
 return labels;
}
