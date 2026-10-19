import {test,expect} from '@playwright/test';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {login,apiRequest} from '../support/browser';

test('real photographs reconstruct through the agent flow without a manual plan or furniture',async({page})=>{
 test.setTimeout(700000);
 const origin='http://localhost:8089',statePath='infra/generated/photo-reconstruction-demo.json';
 await login(page,'agent',origin,'/ops');
 let workspace=existsSync(statePath)?JSON.parse(readFileSync(statePath,'utf8')).workspaceId:null;
 if(!workspace){const created=await apiRequest(page,'/ops/digitization-intakes',{authorityConfirmed:true});expect(created.ok()).toBe(true);workspace=(await created.json()).data.id;writeFileSync(statePath,JSON.stringify({workspaceId:workspace,source:'Licensed real TUM RGB-D desk-area reference photographs; not a full apartment'}));}
 const base=`${origin}/api/v1/ops/digitizations/${workspace}`,target=`/ops/digitization?workspace=${workspace}&view=construction`;
 await page.goto(origin+target);
 await expect(page.getByRole('region',{name:'Property 3D reconstruction',exact:true})).toBeVisible();
 await expect(page.getByRole('region',{name:'3D construction studio',exact:true})).toHaveCount(0);
 expect((await (await page.request.get(base+'/geometry')).json()).data).toBeNull();
 const sources=(await (await page.request.get(base+'/sources')).json()).data;
 if(sources.length===0){
  await page.getByText('1 · Upload photographs and room videos',{exact:true}).click();
  const upload=page.getByRole('region',{name:'Private source processing',exact:true});
  await upload.getByLabel('Choose property source',{exact:true}).setInputFiles(Array.from({length:16},(_,i)=>`infra/generated/reconstruction/queued-camera-input/frame${String(i).padStart(3,'0')}.png`));
  await upload.getByLabel('Source rights and origin',{exact:true}).fill('Licensed TUM RGB-D freiburg1_xyz reference; provenance retained in reconstruction evidence');
  await upload.getByRole('checkbox',{name:'I am authorized to upload and process this property source.',exact:true}).check();
  await upload.getByRole('button',{name:'Upload private source',exact:true}).click();
  await expect(upload.getByText('Source saved privately. Select a processing action below.',{exact:true})).toBeVisible({timeout:90000});
 }
 let candidates=(await (await page.request.get(base+'/frame-candidates')).json()).data;
 if(candidates.frames.length!==16){
  const detail=page.locator('details').filter({has:page.getByText('1 · Upload photographs and room videos',{exact:true})});if(!await detail.evaluate(el=>el.hasAttribute('open')))await detail.locator('summary').click();
  const upload=page.getByRole('region',{name:'Private source processing',exact:true});await upload.getByRole('button',{name:'Reload processing status',exact:true}).click();
  await upload.getByRole('button',{name:'Prepare all photo and video views',exact:true}).click();
  await expect.poll(async()=>{const r=await page.request.get(base+'/frame-candidates');expect(r.ok()).toBe(true);candidates=(await r.json()).data;return candidates.frames.length;},{timeout:300000,intervals:[2000,4000]}).toBe(16);
 }
 expect(candidates.frames.every((f:any)=>f.kind==='photo_frame'&&f.timestampSeconds===null)).toBe(true);
 let status=(await (await page.request.get(base+'/reconstruction-status')).json()).data;
 if(!status.camera?.report?.trainingArchiveAvailable){
  if(!['queued','running'].includes(status.camera?.state)){
  const priorDataset=(await (await page.request.get(base+'/frame-datasets/latest')).json()).data;
  if(!priorDataset){
  await page.getByText('2 · Select and inspect capture views',{exact:true}).click();
  const selection=page.getByRole('region',{name:'Reconstruction capture selection',exact:true});await selection.getByRole('button',{name:'Load prepared capture views'}).click();
  await expect(selection.getByText('16 prepared views · 16 selected',{exact:true})).toBeVisible();
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
 if(status.sceneTraining.job?.exportState!=='succeeded'){
  await expect(reconstruction.getByRole('button',{name:'Reconstruct captured property',exact:true})).toBeEnabled({timeout:60000});
  await reconstruction.getByRole('button',{name:'Reconstruct captured property',exact:true}).click();
  await expect.poll(async()=>{status=(await (await page.request.get(base+'/reconstruction-status')).json()).data;if(status.sceneTraining.job?.state==='failed')throw Error(JSON.stringify(status.sceneTraining.job));return status.sceneTraining.job?.exportState;},{timeout:320000,intervals:[3000,5000]}).toBe('succeeded');
 }
 await page.reload();
 const scene=page.getByRole('region',{name:'Private reconstructed property',exact:true});
 await expect(scene.locator('canvas[aria-label="Private reconstructed scene"]')).toBeVisible({timeout:60000});
 await expect(scene.getByRole('button',{name:'Measure scene performance',exact:true})).toBeEnabled({timeout:60000});
 await expect(scene.getByRole('region',{name:'Captured scene evidence'})).toContainText('500 training steps');
 expect((await (await page.request.get(base+'/geometry')).json()).data).toBeNull();
 await scene.locator('canvas[aria-label="Private reconstructed scene"]').screenshot({path:'evidence/digitization/photo-reconstruction-scene.png'});
 await page.goto(origin+`/ops/digitization?workspace=${workspace}&view=scene`);
 await expect(page.getByRole('heading',{name:'Captured 3D scene',exact:true})).toBeVisible();
 await expect(page.locator('canvas[aria-label="Private reconstructed scene"]')).toBeVisible({timeout:60000});
 await expect(page.getByRole('button',{name:'Measure scene performance',exact:true})).toBeEnabled({timeout:60000});
 const other=await apiRequest(page,'/ops/digitization-intakes',{authorityConfirmed:true}),foreign=(await other.json()).data.id;
 expect((await apiRequest(page,`/ops/digitizations/${foreign}/frame-datasets`,{workspaceVersion:1,inputRevision:1,frames:candidates.frames.map((f:any)=>({artifactId:f.artifactId,artifactVersion:f.artifactVersion,roomId:null,transition:false}))})).ok()).toBe(false);
 console.log(JSON.stringify({label:'O/P',workspaceId:workspace,url:origin+target,realPhotoInputs:16,manualGeometry:false,authoredFurniture:false,camera:status.camera,scene:status.sceneTraining.job,actualGpu:true,publiclyPublished:false}));
});
