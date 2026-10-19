import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import {login} from '../support/browser';
test('author shares both model candidates and assigned staff reviews exact private bytes',async({page,browser},info)=>{
 test.setTimeout(180000);
 const f=JSON.parse(readFileSync(`infra/generated/integration/registration-review-${info.project.name}.json`,'utf8')),origin='http://localhost:8089';
 await login(page,'agent',origin,'/ops');
 const staffContext=await browser.newContext(),staff=await staffContext.newPage();
 try{
  await login(staff,'moderator',origin,'/ops');
  for(const modelType of ['structural','splat'] as const){
   // Geometry authoring itself is tested in the plan lane. Share its exact
   // current synthetic candidate through the same authenticated API contract.
   const workspace=(await (await page.request.get(`${origin}/api/v1/ops/digitizations/${f.engineId}`)).json()).data;
   const input={workspaceVersion:workspace.version,inputRevision:workspace.inputRevision,reviewerId:'00000000-0000-4000-8000-000000000008',previewDelegationConfirmed:true,...(modelType==='structural'?{modelType,geometryRevisionId:f.geometryRevisionId}:{modelType,sceneArtifactId:f.artifactId})};
   const response=await page.request.post(`${origin}/api/v1/ops/digitizations/${f.engineId}/model-review-requests`,{headers:{Origin:origin,'Idempotency-Key':crypto.randomUUID()},data:input});expect(response.status()).toBe(201);const shared=(await response.json()).data;
   await staff.goto(origin+'/ops/reviews');const article=staff.locator(`[data-model-review-id="${shared.id}"]`);await expect(article).toBeVisible();
   await expect(article.getByRole('button',{name:'Approve model candidate',exact:true})).toBeDisabled();
   await article.getByRole('button',{name:'Inspect model candidate',exact:true}).click();
   await article.getByRole('button',{name:modelType==='structural'?'Open 3D preview':'Open scene preview',exact:true}).click();
   await expect(article.getByRole('status')).toContainText(modelType==='structural'?'Structural model loaded':'Scene loaded:',{timeout:30000});
   await article.getByRole('checkbox',{name:'I inspected this exact candidate and confirmed it is suitable for a public property visualization.',exact:true}).check();
   await article.getByRole('checkbox',{name:'I confirmed the estimated or unscaled visualization limitations and unavailable metric measurements.',exact:true}).check();
   await article.getByRole('textbox',{name:'Model review reason',exact:true}).fill('Synthetic automated browser privacy review; no human parity, real property measurement or publication acceptance.');
   const axe=await new AxeBuilder({page:staff}).include(`[data-model-review-id="${shared.id}"]`).analyze();expect(axe.violations.filter(v=>v.impact==='critical'||v.impact==='serious')).toEqual([]);
   for(const width of [320,390,768,1440]){await staff.setViewportSize({width,height:900});expect(await article.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);}
   await article.screenshot({path:`evidence/digitization/model-review-${modelType}-${info.project.name}.png`});
   await article.getByRole('button',{name:'Approve model candidate',exact:true}).click();await expect(article).toHaveCount(0);
   expect((await (await page.request.get(`${origin}/api/v1/ops/digitization-model-reviews/${shared.id}`)).json()).data).toMatchObject({publiclyServed:false,metricMeasurementsAvailable:false,approval:{decision:'approved'}});
   const anonymous=await browser.newContext();try{expect((await anonymous.request.get(`${origin}/api/v1/ops/digitization-model-reviews/${shared.id}/content`)).status()).toBe(401);}finally{await anonymous.close();}
  }
 }finally{await staffContext.close();}
});
