import {test,expect} from '@playwright/test';
import {existsSync,readFileSync,writeFileSync,statSync} from 'node:fs';
import {login,apiRequest} from '../support/browser';

test('generated furnished property video reconstructs through COLMAP and GPU without supplied geometry',async({page})=>{
 test.skip(process.env.RECONSTRUCT_PROPERTY_DEMO!=='true','Opt-in generated local property demonstration.');
 test.setTimeout(900000);page.setDefaultTimeout(60000);
 const origin='http://localhost:8089',statePath='infra/generated/property-capture-demo.json';
 await login(page,'agent',origin,'/ops');
 let workspace=existsSync(statePath)?JSON.parse(readFileSync(statePath,'utf8')).workspaceId:null;
 if(!workspace){const created=await apiRequest(page,'/ops/digitization-intakes',{authorityConfirmed:true});expect(created.ok()).toBe(true);workspace=(await created.json()).data.id;writeFileSync(statePath,JSON.stringify({workspaceId:workspace,source:'Original generated furnished studio apartment capture; synthetic property'}));}
 const base=`${origin}/api/v1/ops/digitizations/${workspace}`,target=`/ops/digitization?workspace=${workspace}&view=construction`;
 await page.goto(origin+target);
 await expect(page.getByRole('region',{name:'Property 3D reconstruction',exact:true})).toBeVisible();
 await expect(page.getByRole('region',{name:'3D construction studio',exact:true})).toHaveCount(0);
 expect((await (await page.request.get(base+'/geometry')).json()).data).toBeNull();
 const sources=(await (await page.request.get(base+'/sources')).json()).data;
 if(sources.length<4){
  await page.getByText('1 · Upload photographs and room videos',{exact:true}).click();
  const capture=page.getByRole('region',{name:'Room capture checklist',exact:true});let session=(await (await page.request.get(base+'/capture-session')).json()).data;if(session?.stale){await capture.getByRole('button',{name:'Discard capture checklist',exact:true}).click();session=null;}if(!session||!['draft','recording'].includes(session.state))await capture.getByRole('button',{name:'Start room capture',exact:true}).click();
  let uploads=(await (await page.request.get(base+'/capture-uploads')).json()).data;
  for(let clip=0;clip<4;clip++){
   const file=`assets/digitization-property-capture/part-${clip}.mp4`;
   if(uploads.some((u:any)=>u.bytes===statSync(file).size&&u.state==='complete'))continue;
   const upload=page.getByRole('region',{name:'Record or upload room clip',exact:true});
   await upload.getByLabel('Choose room video',{exact:true}).setInputFiles(file);
   await upload.getByLabel('Clip rights and source',{exact:true}).fill('Original generated furnished studio apartment. Synthetic property; consistent views of living, dining, kitchen and sleeping areas.');
   await upload.getByRole('checkbox',{name:'I am authorized to capture and upload this property.'}).check();await upload.getByRole('button',{name:'Upload private clip',exact:true}).click();
   await expect(upload.getByRole('status').filter({hasText:'Clip uploaded privately and quarantined'})).toBeVisible({timeout:60000});
   uploads=(await (await page.request.get(base+'/capture-uploads')).json()).data;
  }
  const clips=page.getByRole('region',{name:'Validate uploaded room clips',exact:true});
  for(let clip=0;clip<4;clip++){
   const u=uploads.find((u:any)=>u.bytes===statSync(`assets/digitization-property-capture/part-${clip}.mp4`).size&&u.state==='complete');expect(u).toBeTruthy();
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
 let candidates=(await (await page.request.get(base+'/frame-candidates')).json()).data;
 if(candidates.frames.length!==48){
  const detail=page.locator('details').filter({has:page.getByText('1 · Upload photographs and room videos',{exact:true})});if(!await detail.evaluate(el=>el.hasAttribute('open')))await detail.locator('summary').click();
  const upload=page.getByRole('region',{name:'Private source processing',exact:true});await upload.getByRole('button',{name:'Reload processing status',exact:true}).click();await expect(upload.getByRole('button',{name:'Extract private frames',exact:true})).toHaveCount(4);
  await upload.getByRole('button',{name:'Prepare all photo and video views',exact:true}).click();
  await expect.poll(async()=>{const r=await page.request.get(base+'/frame-candidates');expect(r.ok()).toBe(true);candidates=(await r.json()).data;return candidates.frames.length;},{timeout:300000,intervals:[2000,4000]}).toBe(48);
 }
 expect(candidates.frames.every((f:any)=>f.kind==='video_frame'&&f.timestampSeconds!==null)).toBe(true);
 let status=(await (await page.request.get(base+'/reconstruction-status')).json()).data;
 if(!status.camera?.report?.trainingArchiveAvailable){
  if(!['queued','running'].includes(status.camera?.state)){
  const priorDataset=(await (await page.request.get(base+'/frame-datasets/latest')).json()).data;
  if(!priorDataset){
  await page.getByText('2 · Select and inspect capture views',{exact:true}).click();
  const selection=page.getByRole('region',{name:'Reconstruction capture selection',exact:true});await selection.getByRole('button',{name:'Load prepared capture views'}).click();
  await expect(selection.getByText('48 prepared views · 48 selected',{exact:true})).toBeVisible();
  const analyzed=page.waitForResponse(r=>r.url()===base+'/frame-datasets'&&r.request().method()==='POST');
  await selection.getByRole('button',{name:'Analyze selected capture views',exact:true}).click();
  const analyzedResponse=await analyzed;expect(analyzedResponse.ok(),await analyzedResponse.text()).toBe(true);
  await expect(selection.getByText(/usable views selected/)).toBeVisible({timeout:60000});
  }
  const privacy=page.getByRole('region',{name:'Training frame privacy',exact:true});
  await privacy.getByRole('checkbox',{name:'I inspected the selected frames and supplied their exclusions and masks',exact:true}).check();
  const cameraQueued=page.waitForResponse(r=>r.url()===base+'/camera-processing'&&r.request().method()==='POST');
  await privacy.getByRole('button',{name:'Reconstruct cameras from masked frames',exact:true}).click();
  const cameraResponse=await cameraQueued;expect(cameraResponse.ok(),await cameraResponse.text()).toBe(true);
  }
  await expect.poll(async()=>{status=(await (await page.request.get(base+'/reconstruction-status')).json()).data;if(['failed','awaiting_input'].includes(status.camera?.state))throw Error(JSON.stringify(status.camera));return status.camera?.report?.trainingArchiveAvailable;},{timeout:320000,intervals:[3000,5000]}).toBe(true);
 }
 await page.reload();
 const reconstruction=page.getByLabel('Property reconstruction status',{exact:true});
 status=(await (await page.request.get(base+'/reconstruction-status')).json()).data;
 if(status.sceneTraining.job?.exportState!=='succeeded'||process.env.RETRAIN_PROPERTY_DEMO==='true'){
  await expect(reconstruction.getByRole('button',{name:'Reconstruct captured property',exact:true})).toBeEnabled({timeout:60000});
  await reconstruction.getByRole('button',{name:'Reconstruct captured property',exact:true}).click();
  await expect.poll(async()=>{status=(await (await page.request.get(base+'/reconstruction-status')).json()).data;if(status.sceneTraining.job?.state==='failed')throw Error(JSON.stringify(status.sceneTraining.job));return status.sceneTraining.job?.exportState;},{timeout:320000,intervals:[3000,5000]}).toBe('succeeded');
 }
 await page.reload();
 const tiers=(await (await page.request.get(base+'/scene-tiers')).json()).data;expect(tiers.length).toBeGreaterThanOrEqual(2);expect(tiers.every((t:any)=>t.initialView?.basis==='recovered_capture_unverified')).toBe(true);
 const scene=page.getByRole('region',{name:'Private reconstructed property',exact:true});
 await expect(scene.locator('canvas[aria-label="Private reconstructed scene"]')).toBeVisible({timeout:60000});
 await expect(scene.getByRole('button',{name:'Measure scene performance',exact:true})).toBeEnabled({timeout:60000});
 await expect(scene.getByRole('region',{name:'Captured scene evidence'})).toContainText(process.env.RETRAIN_PROPERTY_DEMO==='true'?'3000 training steps':/(?:500|3000) training steps/);
 expect((await (await page.request.get(base+'/geometry')).json()).data).toBeNull();
 const canvas=scene.locator('canvas[aria-label="Private reconstructed scene"]');
 const initialPixels=await canvas.screenshot({path:'evidence/digitization/property-capture/reconstructed-scene.png'});
 await canvas.focus();await canvas.press('ArrowRight');expect((await canvas.screenshot()).equals(initialPixels)).toBe(false);
 await scene.getByRole('button',{name:'Reset scene view',exact:true}).click();expect((await canvas.screenshot()).equals(initialPixels)).toBe(true);
 await page.goto(origin+`/ops/digitization?workspace=${workspace}&view=scene`);
 await expect(page.getByRole('heading',{name:'Captured 3D scene',exact:true})).toBeVisible();
 await expect(page.locator('canvas[aria-label="Private reconstructed scene"]')).toBeVisible({timeout:60000});
 await expect(page.getByRole('button',{name:'Measure scene performance',exact:true})).toBeEnabled({timeout:60000});
 const other=await apiRequest(page,'/ops/digitization-intakes',{authorityConfirmed:true}),foreign=(await other.json()).data.id;
 expect((await apiRequest(page,`/ops/digitizations/${foreign}/frame-datasets`,{workspaceVersion:1,inputRevision:1,frames:candidates.frames.map((f:any)=>({artifactId:f.artifactId,artifactVersion:f.artifactVersion,roomId:null,transition:false}))})).ok()).toBe(false);
 console.log(JSON.stringify({label:'O/P',workspaceId:workspace,url:origin+target,generatedPropertyVideo:true,captureFrames:candidates.frames.length,manualGeometryInput:false,suppliedFurnitureInput:false,camera:status.camera,scene:status.sceneTraining.job,actualGpu:true,publiclyPublished:false}));
});
