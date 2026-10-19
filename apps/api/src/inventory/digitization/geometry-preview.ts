import type {Actor} from '@haven/database';
import {fail,transaction} from '../../platform/core.js';
import {readGeometryDraft} from './geometry-drafts.js';
import {renderPlanPng} from './plan-render.js';
import {constructionReport} from './construction.js';
import {renderStructuralGlb} from './structural-glb.js';
let active=0;
/** Bounded private preview only; no artifact approval or publication is created. */
export async function readGeometryPng(a:Actor,engine:string,floorId?:string,maxEdge=1024){
 if(active>=2)fail(429,'Plan previews are busy. Retry shortly.','PLAN_PREVIEW_BUSY');
 active++;
 try{
  const draft=await transaction(a,c=>readGeometryDraft(c,a,engine));if(!draft)fail(404,'Private trace not found.');
  const floor=floorId??draft.geometry.floors[0]?.id;
  if(!floor||!draft.geometry.floors.some(f=>f.id===floor))fail(422,'Select a floor in this private geometry.','PLAN_FLOOR_NOT_FOUND');
  let body:Buffer;
  try{body=await renderPlanPng(draft.geometry,floor,maxEdge);}catch(error:any){
   if(error.code==='ENOENT'||String(error.message).startsWith('PLAN_FONT'))fail(503,'The pinned plan font profile is unavailable.','PLAN_FONT_UNAVAILABLE');
   fail(422,'This floor cannot be rendered within the preview budget.','PLAN_RENDER_INVALID');
  }
  await transaction(a,async c=>{const current=await readGeometryDraft(c,a,engine);if(JSON.stringify(current)!==JSON.stringify(draft))fail(409,'Geometry or source scope changed. Reload the preview.','PLAN_PREVIEW_CHANGED');});
  return body;
 }finally{active--;}
}
export async function readGeometryGlb(a:Actor,engine:string){
 if(active>=2)fail(429,'Plan previews are busy. Retry shortly.','PLAN_PREVIEW_BUSY');active++;
 try{
  const draft=await transaction(a,c=>readGeometryDraft(c,a,engine));if(!draft)fail(404,'Private trace not found.');
  const blocker=constructionReport(draft.geometry).issues.find(i=>i.severity==='blocking');
  if(blocker)fail(422,blocker.message,blocker.code);
  let artifact:ReturnType<typeof renderStructuralGlb>;
  try{artifact=renderStructuralGlb(draft.geometry);}catch(error:any){
   const code=String(error.message).startsWith('STRUCTURAL_')?error.message:'STRUCTURAL_GEOMETRY_INVALID';
   fail(422,'Complete the supplied metric, wall and opening dimensions before exporting this structural draft.',code);
  }
  if(artifact.body.length>32*1024*1024)fail(413,'Structural draft exceeds the preview byte budget.','STRUCTURAL_BYTE_BUDGET');
  await transaction(a,async c=>{const current=await readGeometryDraft(c,a,engine);if(JSON.stringify(current)!==JSON.stringify(draft))fail(409,'Geometry or source scope changed. Reload the preview.','PLAN_PREVIEW_CHANGED');});
  return artifact;
 }finally{active--;}
}
