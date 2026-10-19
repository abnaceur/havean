import {test,expect} from '@playwright/test';
import {login} from '../support/browser';
test('agent trains the calibrated reference room on the real GPU and opens its private scene',async({page})=>{
 const workspace=process.env.HAVEN_REAL_GSPLAT_WORKSPACE;
 test.skip(!workspace,'Explicit real GPU opt-in and retained calibrated reference capture required.');test.setTimeout(480000);
 const origin='http://localhost:8089',path=`${origin}/api/v1/ops/digitizations/${workspace}`;
 await login(page,'agent',origin,'/ops');
 await page.goto(`${origin}/ops/digitization?workspace=${workspace}`);
 const status=page.getByLabel('Property reconstruction status',{exact:true});
 await expect(status.getByRole('button',{name:'Reconstruct captured property',exact:true})).toBeEnabled();
 const before=await page.request.get(path+'/reconstruction-status');expect(before.ok()).toBe(true);const initial=(await before.json()).data;
 let runId=initial.sceneTraining.job?.runId;
 if(initial.sceneTraining.job?.exportState!=='succeeded'){
  const queued=page.waitForResponse(r=>r.url()===path+'/scene-training'&&r.request().method()==='POST');
  await status.getByRole('button',{name:'Reconstruct captured property',exact:true}).click();
  const response=await queued;expect(response.ok()).toBe(true);runId=(await response.json()).data.id;
  console.log(JSON.stringify({label:'O',workspace,runId,state:'real_gpu_training_queued'}));
 }
 await expect.poll(async()=>{
  const response=await page.request.get(path+'/reconstruction-status');expect(response.ok()).toBe(true);
  const data=(await response.json()).data,job=data.sceneTraining.job;
  if(job?.state==='failed'||job?.state==='cancelled')throw Error('Actual GPU job '+job.runId+' ended '+job.state);
  return job?.exportState;
 },{timeout:400000,intervals:[3000,5000]}).toBe('succeeded');
 await page.reload();
 const scenes=page.getByRole('region',{name:'Private reconstructed property',exact:true});
 await expect(scenes.getByRole('combobox',{name:'Private scene tier'}).locator('option')).toHaveCount(2);
 await scenes.getByRole('button',{name:'Open scene preview',exact:true}).click();
 const canvas=scenes.locator('canvas[aria-label="Private reconstructed scene"]');
 await expect(canvas).toBeVisible();
 await expect(scenes.getByRole('button',{name:'Measure scene performance',exact:true})).toBeEnabled();
 await canvas.focus();const beforeOrbit=await canvas.screenshot();await page.keyboard.press('ArrowRight');
 expect((await canvas.screenshot()).equals(beforeOrbit)).toBe(false);await page.keyboard.press('+');
 await scenes.getByRole('button',{name:'Reset scene view',exact:true}).click();
 await scenes.screenshot({path:'evidence/digitization/gsplat-real-private-scene.png'});
 await canvas.screenshot({path:'evidence/digitization/gsplat-real-canvas.png'});
 console.log(JSON.stringify({label:'O/P',workspace,runId,actualGpu:true,privateViewerLoaded:true,publiclyServed:false,source:'Licensed reference room; not the authored apartment listing'}));
});
