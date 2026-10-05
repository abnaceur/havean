import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
export function compareBoxes(expected,actual,tolerance=4){
 for(const [name,box] of Object.entries(expected)){
  if(!actual[name])throw Error('Missing visual anchor: '+name);
  for(const coordinate of ['x','y','width','height'])if(!Number.isFinite(actual[name][coordinate])||Math.abs(box[coordinate]-actual[name][coordinate])>tolerance)throw Error('Visual layout shift: '+name+'.'+coordinate);
 }
 return true;
}
export function validateBaselines(manifest,directory,requireApproval=true){
 if(!manifest.renderer||manifest.maxDiffPixelRatio!==0.005||!manifest.screens?.length)throw Error('Missing pinned visual policy');
 const ids=new Set();
 for(const screen of manifest.screens){
  if(ids.has(screen.id)||!screen.route.startsWith('/')||!screen.viewport.width||!screen.viewport.height)throw Error('Invalid visual baseline');ids.add(screen.id);
  if(path.basename(screen.file)!==screen.file)throw Error('Invalid baseline path');
  const digest=createHash('sha256').update(fs.readFileSync(path.join(directory,screen.file))).digest('hex');if(digest!==screen.sha256)throw Error('Baseline changed without review: '+screen.id);
  if(requireApproval&&(!screen.approved||!screen.approvedBy||!screen.approvedAt))throw Error('English baseline awaiting human approval: '+screen.id);
 }
 return manifest.screens.length;
}
if(process.argv[1]?.endsWith('visual-policy.mjs')){const directory='evidence/visual/candidates';console.log('Validated '+validateBaselines(JSON.parse(fs.readFileSync(directory+'/manifest.json')),directory)+' reviewed baselines');}
