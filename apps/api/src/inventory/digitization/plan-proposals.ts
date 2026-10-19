import sharp from 'sharp';
import type {Actor} from '@haven/database';
import {digitizationPlanProposals} from '@haven/contracts';
import {fail} from '../../platform/core.js';
import {readArtifactPreview} from './artifact-preview.js';
import {readPlanPageSelection} from './plan-selection.js';
import {mapPlanPoint} from './plan-page.js';
import {readPlanLabels} from './plan-labels.js';

/** Conservative axis-aligned ink runs. These are editable hypotheses, not walls
 * or scale evidence. Work is bounded to one million grayscale pixels. */
export function proposeInkLines(pixels:Uint8Array,width:number,height:number){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>1024*1024||pixels.length!==width*height)throw Error('PLAN_PROPOSAL_BUDGET');
 const found:{start:{x:number;y:number};end:{x:number;y:number}}[]=[];
 const minimum=Math.max(20,Math.round(Math.min(width,height)*.06));
 for(const horizontal of [true,false]){
  const rows=horizontal?height:width,columns=horizontal?width:height;
  for(let row=0;row<rows;row++){
   let start=-1;
   for(let column=0;column<=columns;column++){
    const dark=column<columns&&pixels[horizontal?row*width+column:column*width+row]<90;
    if(dark&&start<0)start=column;
    if(!dark&&start>=0){
     if(column-start>=minimum){
      const a=horizontal?{x:start,y:row}:{x:row,y:start},b=horizontal?{x:column-1,y:row}:{x:row,y:column-1};
      const duplicate=found.some(line=>Math.abs(line.start.x-a.x)<=3&&Math.abs(line.start.y-a.y)<=3&&Math.abs(line.end.x-b.x)<=3&&Math.abs(line.end.y-b.y)<=3);
      if(!duplicate){found.push({start:a,end:b});if(found.length>=200)return found;}
     }
     start=-1;
    }
   }
  }
 }
 return found;
}
export async function readPlanProposals(a:Actor,engine:string,artifactId:string,clockwiseDegrees:number,workspaceVersion:number,inputRevision:number){
 const selection=await readPlanPageSelection(a,engine,artifactId,clockwiseDegrees);
 if(selection.workspaceVersion!==workspaceVersion||selection.inputRevision!==inputRevision)fail(409,'Reload the current plan before requesting suggestions.','VERSION_CONFLICT');
 const body=await readArtifactPreview(a,engine,artifactId);
 const decoded=await sharp(body,{limitInputPixels:30_000_000}).flatten({background:'#ffffff'}).resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).greyscale().raw().toBuffer({resolveWithObject:true});
 const lines=proposeInkLines(decoded.data,decoded.info.width,decoded.info.height).map(line=>{
  const transform=(p:{x:number;y:number})=>mapPlanPoint(selection.uprightToModel,{x:p.x*selection.uprightWidth/decoded.info.width,y:p.y*selection.uprightHeight/decoded.info.height});
  return {start:transform(line.start),end:transform(line.end),confirmed:false as const};
 });
 const labels=await readPlanLabels(a,engine,selection);
 const fresh=await readPlanPageSelection(a,engine,artifactId,clockwiseDegrees);
 if(JSON.stringify(fresh)!==JSON.stringify(selection))fail(409,'The source changed during suggestions. Reload the plan.','VERSION_CONFLICT');
 return digitizationPlanProposals.parse({selection,method:'bounded-axis-ink-v1',reviewRequired:true,scaleStatus:'unscaled',lines,labels});
}
