import type {Actor} from '@haven/database';
import {digitizationPlanPageSelection,digitizationPlanPageList} from '@haven/contracts';
import {z} from 'zod';
import {fail,transaction} from '../../platform/core.js';
import {checkedWorkspace,requireDigitizationAgency} from './intakes.js';
import {cpuSourceFingerprint} from './execution-scope.js';
import {readArtifactPreview} from './artifact-preview.js';
import {selectPlanPageTransform} from './plan-page.js';
const pageMetadata=z.object({page:z.number().int().min(1).max(50),width:z.number().int().positive(),height:z.number().int().positive(),coordinateSpace:z.literal('upright-page-normalized-top-left'),originalToUpright:z.array(z.number().finite()).length(9)});
export async function listPlanPages(c:import('pg').PoolClient,a:Actor,engine:string){
 await requireDigitizationAgency(c,a);const workspace=await checkedWorkspace(c,engine);
 const sources=(await c.query('SELECT source_set FROM property_input_revisions WHERE digitization_id=$1 AND revision=$2',[engine,workspace.inputRevision])).rows[0]?.source_set??[];
 const rows=(await c.query("SELECT ar.id,ar.profile_id,ar.input_fingerprint,ar.quality_report FROM artifacts ar JOIN processing_stages s ON s.id=ar.stage_id WHERE ar.digitization_id=$1 AND ar.input_revision=$2 AND ar.format='image/png' AND ar.status='private' AND s.stage_type='document_rasterize' AND s.state='succeeded' ORDER BY ar.created_at DESC,ar.id LIMIT 100",[engine,workspace.inputRevision])).rows;
 const seen=new Set<string>(),pages=[];
 for(const row of rows){
  const index=sources.findIndex((source:any)=>['plan','document'].includes(source.purpose)&&cpuSourceFingerprint(engine,workspace.organizationId,workspace.inputRevision,row.profile_id,source)===row.input_fingerprint),meta=pageMetadata.safeParse(row.quality_report);
  if(index<0||!meta.success)continue;
  const key=index+':'+meta.data.page;if(seen.has(key))continue;seen.add(key);
  pages.push({artifactId:row.id,page:meta.data.page,width:meta.data.width,height:meta.data.height,sourceNumber:index+1});
 }
 return digitizationPlanPageList.parse(pages);
}

/** Read-only selection of one committed private page. The editor save is a
 * separate versioned mutation; this never declares scale or extracted geometry.
 */
export async function readPlanPageSelection(a:Actor,engine:string,artifactId:string,clockwiseDegrees:number){
 async function current(){return transaction(a,async c=>{
  await requireDigitizationAgency(c,a);const workspace=await checkedWorkspace(c,engine);
  if(workspace.state!=='active')fail(409,'This workspace no longer accepts page selection.','WORKFLOW_CONFLICT');
  const artifact=(await c.query("SELECT ar.id,ar.checksum,ar.input_revision,ar.input_fingerprint,ar.profile_id,ar.quality_report FROM artifacts ar JOIN processing_stages s ON s.id=ar.stage_id WHERE ar.id=$1 AND ar.digitization_id=$2 AND ar.format='image/png' AND ar.status='private' AND s.stage_type='document_rasterize' AND s.state='succeeded'",[artifactId,engine])).rows[0];
  if(!artifact)fail(404,'Private plan page not found.');
  if(artifact.input_revision!==workspace.inputRevision)fail(409,'Select a page from the current source revision.','INPUT_REVISION_CONFLICT');
  const sources=(await c.query('SELECT source_set FROM property_input_revisions WHERE digitization_id=$1 AND revision=$2',[engine,workspace.inputRevision])).rows[0]?.source_set??[];
  const matches=sources.filter((source:any)=>['plan','document'].includes(source.purpose)&&cpuSourceFingerprint(engine,workspace.organizationId,workspace.inputRevision,artifact.profile_id,source)===artifact.input_fingerprint);
  if(matches.length!==1)fail(422,'The page has no unique current source.','PLAN_SOURCE_INVALID');
  return {workspaceVersion:workspace.version,inputRevision:workspace.inputRevision,checksum:artifact.checksum,source:matches[0],page:pageMetadata.parse(artifact.quality_report)};
 });}
 const selected=await current();
 // Preview delivery verifies stored bytes and current source-read authority;
 // checking again closes target/revision changes during storage retrieval.
 await readArtifactPreview(a,engine,artifactId);
 if(JSON.stringify(await current())!==JSON.stringify(selected))fail(409,'The plan source changed. Reload before selecting.','INPUT_REVISION_CONFLICT');
 const {page}=selected,m=page.originalToUpright,swapped=m[0]===0;
 let transform;
 try{transform=selectPlanPageTransform(swapped?page.height:page.width,swapped?page.width:page.height,m,clockwiseDegrees);}
 catch{fail(422,'This page orientation or deskew exceeds its approved profile.','PLAN_TRANSFORM_INVALID');}
 return digitizationPlanPageSelection.parse({digitizationId:engine,workspaceVersion:selected.workspaceVersion,inputRevision:selected.inputRevision,artifactId,source:{kind:'asset',assetId:selected.source.assetId,page:page.page,originalToModel:transform.originalToModel},width:transform.width,height:transform.height,uprightWidth:page.width,uprightHeight:page.height,modelToOriginal:transform.modelToOriginal,uprightToModel:selectPlanPageTransform(page.width,page.height,[1,0,0,0,1,0,0,0,1],clockwiseDegrees).originalToModel,unit:'px',scaleStatus:'unscaled'});
}
