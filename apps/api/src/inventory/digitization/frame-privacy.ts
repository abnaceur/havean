import type pg from 'pg';
import type {Actor} from '@haven/database';
import {event} from '@haven/database';
import {digitizationFrameDatasetRecord,digitizationFramePrivacyCreate,digitizationFramePrivacyRecord} from '@haven/contracts';
import type {z} from 'zod';
import {fail,transaction} from '../../platform/core.js';
import {frameDatasetContext} from './frame-datasets.js';
import {readArtifactPreview} from './artifact-preview.js';
import {verifySmallDigitizationSource} from './source-validation.js';
import {maskTrainingFrame,trainingFrameTar} from './frame-privacy-pixels.js';
type Input=z.infer<typeof digitizationFramePrivacyCreate>;
export async function framePrivacyContext(c:pg.PoolClient,a:Actor,engine:string,input:Input,lockWorkspace=true){
 const row=(await c.query('SELECT * FROM digitization_frame_datasets WHERE id=$1 AND digitization_id=$2 AND input_revision=$3',[input.recipe.datasetId,engine,input.inputRevision])).rows[0];
 if(!row)fail(404,'Current private frame dataset not found.');
 const dataset=digitizationFrameDatasetRecord.parse({id:row.id,version:row.version,inputRevision:row.input_revision,createdAt:new Date(row.created_at).toISOString(),report:row.report,measuredFrames:row.frames});
 const context=await frameDatasetContext(c,a,engine,{workspaceVersion:input.workspaceVersion,inputRevision:input.inputRevision,frames:dataset.measuredFrames.map(f=>({artifactId:f.artifactId,artifactVersion:f.artifactVersion,roomId:f.roomId,transition:f.transition}))},lockWorkspace);
 const selected=dataset.measuredFrames.filter(f=>dataset.report.selectedArtifactIds.includes(f.artifactId));
 if(input.recipe.datasetVersion!==dataset.version||input.recipe.excludedFrameIds.some(id=>!selected.some(f=>f.artifactId===id))||input.recipe.masks.some(mask=>!selected.some(f=>f.artifactId===mask.artifactId)))fail(422,'Annotate only selected current frames.','FRAME_PRIVACY_INVALID');
 for(const mask of input.recipe.masks){const frame=selected.find(f=>f.artifactId===mask.artifactId)!;for(const box of mask.regions)if(box.x+box.width>frame.quality.width||box.y+box.height>frame.quality.height)fail(422,'Mask rectangles must fit actual frame pixels.','FRAME_PRIVACY_INVALID');}
 return {dataset,context,selected};
}
function record(row:any,count:number){return digitizationFramePrivacyRecord.parse({id:row.id,version:row.version,inputRevision:row.input_revision,workspaceVersion:row.workspace_version,recipe:row.recipe,recipeFingerprint:row.recipe_fingerprint,selectedSourceFrameCount:count,trainingFrameCount:count-row.recipe.excludedFrameIds.length,privacyReviewRequired:true,annotationBasis:'user_supplied_unverified',publiclyServed:false});}
export async function createFramePrivacy(c:pg.PoolClient,a:Actor,engine:string,input:Input){
 const context=await framePrivacyContext(c,a,engine,input);
 const count=(await c.query('SELECT count(*)::int n FROM digitization_frame_privacy_recipes WHERE digitization_id=$1 AND created_by=$2',[engine,a.id])).rows[0].n;
 if(count>=1000)fail(429,'Private privacy recipe capacity reached.','FRAME_PRIVACY_BUDGET_EXCEEDED');
 const row=(await c.query("INSERT INTO digitization_frame_privacy_recipes(digitization_id,organization_id,created_by,workspace_version,input_revision,dataset_id,recipe,recipe_fingerprint) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,encode(sha256(convert_to(($7::jsonb)::text,'UTF8')),'hex')) RETURNING *",[engine,a.orgId,a.id,input.workspaceVersion,input.inputRevision,input.recipe.datasetId,JSON.stringify(input.recipe)])).rows[0];
 await event(c,a,engine,'digitization.frame_privacy_created',{recipeId:row.id,datasetId:row.dataset_id,inputRevision:input.inputRevision});
 return record(row,context.selected.length);
}
let activePreparations=0;
export async function preparePrivateTrainingFrames(a:Actor,engine:string,recipeId:string,workspaceVersion:number,inputRevision:number){
 if(activePreparations>=2)fail(429,'Private frame preparation is busy.','FRAME_PRIVACY_BUDGET_EXCEEDED');
 activePreparations++;const deadline=Date.now()+180000;
 const remaining=()=>{if(Date.now()>deadline)fail(422,'Prepare fewer frames within the private time budget.','FRAME_PRIVACY_BUDGET_EXCEEDED');};
 try{
 const current=async(c:pg.PoolClient)=>{const row=(await c.query('SELECT * FROM digitization_frame_privacy_recipes WHERE id=$1 AND digitization_id=$2 AND input_revision=$3',[recipeId,engine,inputRevision])).rows[0];if(!row)fail(404,'Private frame privacy recipe not found.');const input=digitizationFramePrivacyCreate.parse({workspaceVersion,inputRevision,recipe:row.recipe});return {row,input,...await framePrivacyContext(c,a,engine,input)};};
 const context=await transaction(a,current),sources=new Map(context.context.map(frame=>[frame.source.assetId,frame.source]));
 const verify=async()=>{for(const source of sources.values()){remaining();const verified=await verifySmallDigitizationSource(a,engine,source.assetId,source.assetVersion,inputRevision,source.purpose);if(verified.sha256!==source.sha256)fail(409,'Training source changed.','SOURCE_CONTENT_CHANGED');}};
 await verify();const entries:Array<{name:string;body:Buffer}>=[],frames:Array<Record<string,unknown>>=[];let bytes=0;
 const selected=context.selected.filter(f=>!context.input.recipe.excludedFrameIds.includes(f.artifactId));
 if(!selected.length)fail(422,'No training frames remain. Capture or select usable frames.','FRAME_PRIVACY_EMPTY');
 for(const frame of selected){
  remaining();const regions=context.input.recipe.masks.find(mask=>mask.artifactId===frame.artifactId)?.regions??[];
  const masked=await maskTrainingFrame(await readArtifactPreview(a,engine,frame.artifactId),regions);
  if(masked.sourceSha256!==frame.quality.sha256||masked.width!==frame.quality.width||masked.height!==frame.quality.height)fail(409,'Training frame changed.','FRAME_DATASET_CHANGED');
  bytes+=masked.body.length;if(bytes>383*1024*1024)fail(422,'Prepare fewer training frames.','FRAME_PRIVACY_BUDGET_EXCEEDED');
  const name=`frames/${frame.artifactId}.png`;entries.push({name,body:masked.body});frames.push({name,artifactId:frame.artifactId,artifactVersion:frame.artifactVersion,cameraGroupId:frame.cameraGroupId,roomId:frame.roomId,captureKind:context.context.find(item=>item.row.id===frame.artifactId)!.source.purpose==='photo'?'photo':'video',timestampSeconds:frame.timestampSeconds,sourceSha256:masked.sourceSha256,sha256:masked.sha256,width:masked.width,height:masked.height,maskedRegionCount:regions.length});
 }
 await verify();remaining();const fresh=await transaction(a,current);if(JSON.stringify(fresh)!==JSON.stringify(context))fail(409,'Frame privacy authority changed.','FRAME_DATASET_CHANGED');
 const manifest={schemaVersion:1,recipeId,recipeFingerprint:context.row.recipe_fingerprint,datasetId:context.dataset.id,inputRevision,frames,excludedFrameIds:context.input.recipe.excludedFrameIds,privacyReviewRequired:true,annotationBasis:'user_supplied_unverified',publiclyServed:false,geometricCoverage:null,intrinsics:null,pose:null,scale:null};
 return trainingFrameTar([{name:'manifest.json',body:Buffer.from(JSON.stringify(manifest))},...entries]);
 }finally{activePreparations--;}
}
