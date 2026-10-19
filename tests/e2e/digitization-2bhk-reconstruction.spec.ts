import {test,expect} from '@playwright/test';
import {existsSync,readFileSync,writeFileSync,statSync} from 'node:fs';
import {login,apiRequest} from '../support/browser';

test('high-resolution furnished two-bedroom apartment reconstructs through the agent platform',async({page})=>{
 test.skip(process.env.RECONSTRUCT_2BHK_DEMO!=='true','Opt-in generated local property demonstration.');
 test.setTimeout(4200000);page.setDefaultTimeout(60000);
 const origin='http://localhost:8089',statePath='infra/generated/two-bedroom-demo.json';
 await login(page,'agent',origin,'/ops');
 let workspace=existsSync(statePath)?JSON.parse(readFileSync(statePath,'utf8')).workspaceId:null;
 if(!workspace){const created=await apiRequest(page,'/ops/digitization-intakes',{authorityConfirmed:true});expect(created.ok()).toBe(true);workspace=(await created.json()).data.id;writeFileSync(statePath,JSON.stringify({workspaceId:workspace,source:'Original generated high-resolution furnished two-bedroom apartment capture; synthetic property'}));}
 const base=`${origin}/api/v1/ops/digitizations/${workspace}`,target=`/ops/digitization?workspace=${workspace}&view=construction`;
 await page.goto(origin+target);
 await expect(page.getByRole('region',{name:'Property 3D reconstruction',exact:true})).toBeVisible();
 await expect(page.getByRole('region',{name:'3D construction studio',exact:true})).toHaveCount(0);
 expect((await (await page.request.get(base+'/geometry')).json()).data).toBeNull();
 const sources=(await (await page.request.get(base+'/sources')).json()).data;
 if(sources.length<17){
  const sourcePanel=page.getByRole('region',{name:'Private source processing',exact:true});
  const firstStep=page.locator('details').filter({has:page.getByText('1 · Upload photographs and room videos',{exact:true})});if(!await firstStep.evaluate(el=>el.hasAttribute('open')))await firstStep.locator('summary').click();
  await expect(sourcePanel.getByRole('button',{name:'Reload processing status',exact:true})).toBeEnabled({timeout:60000});await sourcePanel.getByRole('button',{name:'Reload processing status',exact:true}).click();
  await expect(sourcePanel.getByRole('button',{name:'Extract private frames',exact:true})).toHaveCount(sources.length,{timeout:60000});
  const activeRuns=sourcePanel.getByRole('button',{name:'Cancel processing run',exact:true});while(await activeRuns.count()){const before=await activeRuns.count();await activeRuns.first().click();await expect(activeRuns).toHaveCount(before-1,{timeout:60000});}
  if(process.env.STOP_2BHK_CAPTURE_ONLY==='true')return;


  const capture=page.getByRole('region',{name:'Room capture checklist',exact:true});let session=(await (await page.request.get(base+'/capture-session')).json()).data;if(session?.stale){await capture.getByRole('button',{name:'Discard capture checklist',exact:true}).click();session=null;}if(!session||!['draft','recording'].includes(session.state))await capture.getByRole('button',{name:'Start room capture',exact:true}).click();
  let uploads=(await (await page.request.get(base+'/capture-uploads')).json()).data;
  for(let clip=0;clip<17;clip++){
   const file=`assets/digitization-2bhk/part-${clip}.mp4`;
   if(uploads.some((u:any)=>u.bytes===statSync(file).size&&u.state==='complete'))continue;
   const upload=page.getByRole('region',{name:'Record or upload room clip',exact:true});
   await upload.getByLabel('Choose room video',{exact:true}).setInputFiles(file);
   await upload.getByLabel('Clip rights and source',{exact:true}).fill('Original generated furnished two-bedroom apartment. Synthetic property; 1920 by 1440 overlapping captures of living, kitchen, two bedrooms, hall and bathroom.');
   await upload.getByRole('checkbox',{name:'I am authorized to capture and upload this property.'}).check();await upload.getByRole('button',{name:'Upload private clip',exact:true}).click();
   await expect(upload.getByRole('status').filter({hasText:'Clip uploaded privately and quarantined'})).toBeVisible({timeout:60000});
   uploads=(await (await page.request.get(base+'/capture-uploads')).json()).data;
  }
  const clips=page.getByRole('region',{name:'Validate uploaded room clips',exact:true});
  for(let clip=0;clip<17;clip++){
   const u=uploads.find((u:any)=>u.bytes===statSync(`assets/digitization-2bhk/part-${clip}.mp4`).size&&u.state==='complete');expect(u).toBeTruthy();
   const admitted=(await (await page.request.get(base+'/capture-uploads/'+u.id+'/source')).json()).data;
   if(admitted&&sources.some((s:any)=>s.assetId===admitted.assetId))continue;
   await clips.getByRole('combobox',{name:'Completed capture clip',exact:true}).selectOption(u.id);
   const scanned=page.waitForResponse(r=>r.url()===base+'/capture-uploads/'+u.id+'/source'&&r.request().method()==='POST');
   await clips.getByRole('button',{name:'Scan private clip',exact:true}).click();expect((await scanned).ok()).toBe(true);
   await expect(clips.getByRole('status')).toContainText('The exact private clip passed scanning.',{timeout:60000});
   await clips.getByRole('button',{name:'Add scanned clip to property sources',exact:true}).click();await expect(clips.getByRole('status')).toContainText('Private clip added.',{timeout:60000});
  }
 }

 console.log('Property capture inputs are uploaded and bound.');
 const candidatesResponse=await page.request.get(base+'/frame-candidates',{timeout:240000});expect(candidatesResponse.ok(),await candidatesResponse.text()).toBe(true);let candidates=(await candidatesResponse.json()).data;
 if(candidates.frames.length!==204){
  const detail=page.locator('details').filter({has:page.getByText('1 · Upload photographs and room videos',{exact:true})});if(!await detail.evaluate(el=>el.hasAttribute('open')))await detail.locator('summary').click();
  const upload=page.getByRole('region',{name:'Private source processing',exact:true});await upload.getByRole('button',{name:'Reload processing status',exact:true}).click();await expect(upload.getByRole('button',{name:'Extract private frames',exact:true})).toHaveCount(17,{timeout:60000});
  if(process.env.RECOVER_2BHK_DEMO==='true'){const retry=upload.getByRole('button',{name:'Retry cancellation',exact:true});if(await retry.count()){await retry.first().click();await expect(upload.getByRole('button',{name:'Reload processing status',exact:true})).toBeEnabled();}const cancelButtons=upload.getByRole('button',{name:'Cancel processing run',exact:true});while(await cancelButtons.count()){const before=await cancelButtons.count();await cancelButtons.first().click();await expect(cancelButtons).toHaveCount(before-1,{timeout:60000});}}
  await upload.getByRole('button',{name:'Prepare all photo and video views',exact:true}).click();
  await expect.poll(async()=>{const r=await page.request.get(base+'/frame-candidates');expect(r.ok()).toBe(true);candidates=(await r.json()).data;return candidates.frames.length;},{timeout:1800000,intervals:[2000,4000]}).toBe(204);
 }
 expect(candidates.frames.every((f:any)=>f.kind==='video_frame'&&f.timestampSeconds!==null&&f.width===1600&&f.height===1200)).toBe(true);

 if(process.env.RESTART_2BHK_CAMERA==='true'){
  const first=page.locator('details').filter({has:page.getByText('1 · Upload photographs and room videos',{exact:true})});if(!await first.evaluate(el=>el.hasAttribute('open')))await first.locator('summary').click();
  const panel=page.getByRole('region',{name:'Private source processing',exact:true});await panel.getByRole('button',{name:'Reload processing status',exact:true}).click();await expect(panel.getByRole('button',{name:'Extract private frames',exact:true})).toHaveCount(17,{timeout:60000});
  const retry=panel.getByRole('button',{name:'Retry cancellation',exact:true});while(await retry.count()){const before=await retry.count();await retry.first().click();await expect(retry).toHaveCount(before-1,{timeout:240000});}
  const active=panel.getByRole('button',{name:'Cancel processing run',exact:true});while(await active.count()){const before=await active.count();await active.first().click();await expect(active).toHaveCount(before-1,{timeout:60000});}
 }
 await page.reload();
 let status=(await (await page.request.get(base+'/reconstruction-status')).json()).data;
 if((!status.camera?.report?.trainingArchiveAvailable&&status.camera?.stageState!=='succeeded')||status.camera?.report?.state==='awaiting_input'||process.env.REANNOTATE_2BHK_DEMO==='true'){
  if(!['queued','running'].includes(status.camera?.state)){
  const priorDataset=(await (await page.request.get(base+'/frame-datasets/latest')).json()).data;
  if(!priorDataset||process.env.REANNOTATE_2BHK_DEMO==='true'){
  await page.getByText('2 · Select and inspect capture views',{exact:true}).click();
  const selection=page.getByRole('region',{name:'Reconstruction capture selection',exact:true});await selection.getByRole('button',{name:'Load prepared capture views'}).click();
  await expect(selection.getByText(/^204 prepared views ·/)).toBeVisible();
  const currentUploads=(await (await page.request.get(base+'/capture-uploads')).json()).data;
  for(const clip of [3,4,5,6,8,9,10,11]){const upload=currentUploads.find((u:any)=>u.bytes===statSync(`assets/digitization-2bhk/part-${clip}.mp4`).size&&u.state==='complete');expect(upload).toBeTruthy();const source=(await (await page.request.get(base+'/capture-uploads/'+upload.id+'/source')).json()).data;await selection.getByRole('textbox',{name:'Room label for source '+source.assetId,exact:true}).fill(clip<7?'Bedroom 1':'Bedroom 2');}
  if(process.env.EXCLUDE_2BHK_UNSTABLE_VIEWS==='true'){
   for(const clip of [3,4,5,8]){const upload=currentUploads.find((u:any)=>u.bytes===statSync(`assets/digitization-2bhk/part-${clip}.mp4`).size&&u.state==='complete');const source=(await (await page.request.get(base+'/capture-uploads/'+upload.id+'/source')).json()).data;
    if(clip===3||clip===8)await selection.getByRole('checkbox',{name:'Include source '+source.assetId,exact:true}).uncheck();
    else{const index=candidates.frames.findIndex((f:any)=>f.cameraGroupId===source.assetId&&Number(f.timestampSeconds)===(clip===4?11:0));expect(index).toBeGreaterThanOrEqual(0);await selection.getByRole('checkbox',{name:new RegExp('^Video frame '+(index+1)+' ·')}).uncheck();}
   }
   await expect(selection.getByText('204 prepared views · 178 selected',{exact:true})).toBeVisible();
  }
  const analyzed=page.waitForResponse(r=>r.url()===base+'/frame-datasets'&&r.request().method()==='POST',{timeout:240000});
  await selection.getByRole('button',{name:'Analyze selected capture views',exact:true}).click();
  const analyzedResponse=await analyzed;expect(analyzedResponse.ok(),await analyzedResponse.text()).toBe(true);
  await expect(selection.getByText(/usable views selected/)).toBeVisible({timeout:60000});
  }
  const privacy=page.getByRole('region',{name:'Training frame privacy',exact:true});
  await privacy.getByRole('checkbox',{name:'I inspected the selected frames and supplied their exclusions and masks',exact:true}).check();
  const cameraQueued=page.waitForResponse(r=>r.url()===base+'/camera-processing'&&r.request().method()==='POST',{timeout:480000});
  await privacy.getByRole('button',{name:'Reconstruct cameras from masked frames',exact:true}).click();
  const cameraResponse=await cameraQueued;expect(cameraResponse.ok(),await cameraResponse.text()).toBe(true);
  }
  await expect.poll(async()=>{status=(await (await page.request.get(base+'/reconstruction-status')).json()).data;if(['failed','awaiting_input'].includes(status.camera?.state)||status.camera?.report?.state==='awaiting_input')throw Error(JSON.stringify(status.camera));return status.camera?.report?.trainingArchiveAvailable;},{timeout:1800000,intervals:[3000,5000]}).toBe(true);
 }
 await page.reload();
 const reconstruction=page.getByLabel('Property reconstruction status',{exact:true});
 status=(await (await page.request.get(base+'/reconstruction-status')).json()).data;
 if(status.sceneTraining.job?.exportState!=='succeeded'||process.env.RETRAIN_2BHK_DEMO==='true'){
  if(!['draft','queued','running'].includes(status.sceneTraining.job?.state)){
  await expect(reconstruction.getByRole('button',{name:'Reconstruct captured property',exact:true})).toBeEnabled({timeout:60000});
  const trainingQueued=page.waitForResponse(r=>r.url()===base+'/scene-training'&&r.request().method()==='POST',{timeout:240000});
  await reconstruction.getByRole('button',{name:'Reconstruct captured property',exact:true}).click();
  const trainingResponse=await trainingQueued;expect(trainingResponse.ok(),await trainingResponse.text()).toBe(true);
  }
  await expect.poll(async()=>{status=(await (await page.request.get(base+'/reconstruction-status')).json()).data;if(status.sceneTraining.job?.state==='failed')throw Error(JSON.stringify(status.sceneTraining.job));return status.sceneTraining.job?.exportState;},{timeout:1800000,intervals:[3000,5000]}).toBe('succeeded');
 }
 await page.reload();
 const tiers=(await (await page.request.get(base+'/scene-tiers')).json()).data;expect(tiers.length).toBeGreaterThanOrEqual(2);expect(tiers.every((t:any)=>t.initialView?.basis==='recovered_capture_unverified')).toBe(true);
 const scene=page.getByRole('region',{name:'Private reconstructed property',exact:true});
 await expect(scene.locator('canvas[aria-label="Private reconstructed scene"]')).toBeVisible({timeout:240000});
 await expect(scene.getByRole('button',{name:'Measure scene performance',exact:true})).toBeEnabled({timeout:60000});
 await expect(scene.getByRole('region',{name:'Captured scene evidence'})).toContainText(process.env.RETRAIN_2BHK_DEMO==='true'?'6000 training steps':/6000 training steps/);
 expect((await (await page.request.get(base+'/geometry')).json()).data).toBeNull();
 const canvas=scene.locator('canvas[aria-label="Private reconstructed scene"]');
 const initialPixels=await canvas.screenshot({path:'evidence/digitization/2bhk/reconstructed-scene.png'});
 await canvas.focus();await canvas.press('ArrowRight');expect((await canvas.screenshot()).equals(initialPixels)).toBe(false);
 await scene.getByRole('button',{name:'Reset scene view',exact:true}).click();expect((await canvas.screenshot()).equals(initialPixels)).toBe(true);
 const viewpoints=scene.getByRole('combobox',{name:'Captured viewpoints',exact:true});await expect(viewpoints).toBeVisible();
 for(const [index,view] of tiers[0].captureViews.entries()){await viewpoints.selectOption(view.id);await expect(scene.getByRole('button',{name:'Measure scene performance',exact:true})).toBeEnabled({timeout:60000});await canvas.screenshot({path:`evidence/digitization/2bhk/view-${String(index+1).padStart(2,'0')}.png`});}
 await viewpoints.selectOption('');
 await page.goto(origin+`/ops/digitization?workspace=${workspace}&view=scene`);
 await expect(page.getByRole('heading',{name:'Captured 3D scene',exact:true})).toBeVisible();
 await expect(page.locator('canvas[aria-label="Private reconstructed scene"]')).toBeVisible({timeout:60000});
 await expect(page.getByRole('button',{name:'Measure scene performance',exact:true})).toBeEnabled({timeout:60000});
 const other=await apiRequest(page,'/ops/digitization-intakes',{authorityConfirmed:true}),foreign=(await other.json()).data.id;
 expect((await apiRequest(page,`/ops/digitizations/${foreign}/frame-datasets`,{workspaceVersion:1,inputRevision:1,frames:candidates.frames.map((f:any)=>({artifactId:f.artifactId,artifactVersion:f.artifactVersion,roomId:null,transition:false}))})).ok()).toBe(false);
 console.log(JSON.stringify({label:'O/P',workspaceId:workspace,url:origin+target,generatedPropertyVideo:true,captureFrames:candidates.frames.length,manualGeometryInput:false,suppliedFurnitureInput:false,camera:status.camera,scene:status.sceneTraining.job,actualGpu:true,publiclyPublished:false}));
});
