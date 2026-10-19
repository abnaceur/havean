import {createHash,randomUUID} from 'node:crypto';
import type pg from 'pg';
import type {Actor} from '@haven/database';
import {digitizationFramePrivacyCreate} from '@haven/contracts';
import {env,fail,transaction} from '../../platform/core.js';
import {checkedWorkspace} from './intakes.js';
import {framePrivacyContext,preparePrivateTrainingFrames} from './frame-privacy.js';
import {cpuSourceFingerprint} from './execution-scope.js';
import {createRunGraph,dispatchRunGraph} from './workflow.js';

export const cameraProfile='private-colmap-cpu-investigation-v1';
export function cameraAvailable(){return env.NODE_ENV!=='production'&&process.env.PROCESSING_ENABLE_CAMERA_INVESTIGATION==='true'&&(env.NODE_ENV==='development'&&process.env.PROCESSING_DEPLOYMENT==='development'||process.env.HAVEN_CONTAINER_TESTS==='true'&&process.env.PROCESSING_DEPLOYMENT==='test');}
export async function currentCameraRecipe(c:pg.PoolClient,a:Actor,engine:string,recipeId:string,workspaceVersion:number,inputRevision:number,lockWorkspace=true){
 const recipe=(await c.query('SELECT * FROM digitization_frame_privacy_recipes WHERE id=$1 AND digitization_id=$2 AND input_revision=$3',[recipeId,engine,inputRevision])).rows[0];
 if(!recipe)fail(404,'Current private frame recipe not found.');
 const context=await framePrivacyContext(c,a,engine,digitizationFramePrivacyCreate.parse({workspaceVersion,inputRevision,recipe:recipe.recipe}),lockWorkspace);
 const selected=context.selected.filter(frame=>!recipe.recipe.excludedFrameIds.includes(frame.artifactId));
 if(selected.length<10)fail(422,'Select at least ten usable privacy-reviewed frames for camera reconstruction and held-out views.','CAMERA_FRAMES_REQUIRED');
 if(new Set(selected.map(frame=>frame.cameraGroupId)).size>32)fail(422,'Select at most 32 photograph or clip sources for this reconstruction profile. Different sources retain separate camera calibration.','CAMERA_GROUP_BUDGET_EXCEEDED');
 const sources=[...new Map(context.context.map(frame=>[frame.source.assetId,frame.source])).values()].sort((x,y)=>x.assetId.localeCompare(y.assetId));
 for(const source of sources)if(!(await c.query("SELECT digitization_asset_access($1,$2,$3,$4,'document_processing') allowed",[engine,source.assetId,source.assetVersion,inputRevision])).rows[0].allowed)fail(403,'Current frame source authority is required.','SOURCE_ACCESS_CHANGED');
 return {recipe,context,sources};
}
export async function currentCameraInput(c:pg.PoolClient,a:Actor,engine:string,stage:any,assetId?:string,lockWorkspace=true){
 const input=(await c.query('SELECT * FROM digitization_camera_inputs WHERE stage_id=$1 AND digitization_id=$2',[stage.id,engine])).rows[0];
 if(!input||input.created_by!==a.id||input.input_revision!==stage.input_revision||assetId&&input.source.assetId!==assetId)fail(404,'Current prepared camera input not found.','SOURCE_NOT_FOUND');
 await currentCameraRecipe(c,a,engine,input.recipe_id,input.workspace_version,input.input_revision,lockWorkspace);
 if(cpuSourceFingerprint(engine,a.orgId!,stage.input_revision,cameraProfile,input.source)!==stage.input_fingerprint)fail(409,'The prepared camera inputs changed.','INPUT_FINGERPRINT_CONFLICT');
 return input;
}
export async function prepareCameraProcessing(a:Actor,engine:string,input:{recipeId:string;workspaceVersion:number;inputRevision:number}){
 if(!cameraAvailable())fail(422,'CPU camera reconstruction is unavailable.','PROFILE_UNAVAILABLE');
 const before=await transaction(a,c=>currentCameraRecipe(c,a,engine,input.recipeId,input.workspaceVersion,input.inputRevision));
 const body=await preparePrivateTrainingFrames(a,engine,input.recipeId,input.workspaceVersion,input.inputRevision);
 // The API constructs this tar; the first canonical entry is manifest.json.
 const manifestSize=parseInt(body.subarray(124,136).toString().replace(/\0/g,'').trim(),8);
 if(!Number.isSafeInteger(manifestSize)||manifestSize<1||manifestSize>1048576||body.subarray(0,100).toString().replace(/\0/g,'')!=='manifest.json')fail(422,'The prepared frame manifest is invalid.','CAMERA_INPUT_INVALID');
 const manifestSha256=createHash('sha256').update(body.subarray(512,512+manifestSize)).digest('hex');
 const source={...before.sources[0],purpose:'video',sha256:createHash('sha256').update(body).digest('hex'),bytes:String(body.length),detectedMime:'application/x-tar',decoderState:'private_frames_prepared'};
 return {before,source,manifestSha256};
}
export async function commitCameraProcessing(c:pg.PoolClient,a:Actor,engine:string,input:{recipeId:string;workspaceVersion:number;inputRevision:number},prepared:Awaited<ReturnType<typeof prepareCameraProcessing>>){
 if(!cameraAvailable())fail(422,'CPU camera reconstruction is unavailable.','PROFILE_UNAVAILABLE');
 const fresh=await currentCameraRecipe(c,a,engine,input.recipeId,input.workspaceVersion,input.inputRevision);
 if(JSON.stringify(fresh)!==JSON.stringify(prepared.before))fail(409,'The camera input authority changed.','FRAME_DATASET_CHANGED');
 const workspace=await checkedWorkspace(c,engine),fingerprint=cpuSourceFingerprint(engine,a.orgId!,input.inputRevision,cameraProfile,prepared.source);
 if((await c.query("SELECT 1 FROM processing_stages s JOIN processing_runs r ON r.id=s.run_id WHERE s.digitization_id=$1 AND s.input_fingerprint=$2 AND r.state IN('draft','queued','running') AND r.cancel_requested_at IS NULL",[engine,fingerprint])).rowCount)fail(409,'These frames are already processing.','PROCESSING_ALREADY_ACTIVE');
 const runId=randomUUID(),stageId=randomUUID();
 await createRunGraph(c,a,engine,input.workspaceVersion,{schemaVersion:1,id:runId,organizationId:a.orgId!,creatorId:a.id,target:workspace.target,inputRevision:input.inputRevision,state:'draft',version:1,stages:[{id:stageId,type:'camera_solve',state:'pending',dependencies:[],profileId:cameraProfile,inputFingerprint:fingerprint,inputRevision:input.inputRevision,attempt:0,fencingToken:null,executionId:null,progress:null}],deadline:new Date(Date.now()+1800000).toISOString(),budget:{maxSeconds:1440,maxScratchBytes:'2147483648'}},['scene']);
 await c.query('INSERT INTO digitization_camera_inputs(stage_id,digitization_id,organization_id,created_by,input_revision,workspace_version,recipe_id,source,manifest_sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[stageId,engine,a.orgId,a.id,input.inputRevision,input.workspaceVersion,input.recipeId,prepared.source,prepared.manifestSha256]);
 return {...await dispatchRunGraph(c,a,engine,runId,1),inputRevision:input.inputRevision};
}
