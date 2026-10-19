import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import {login} from '../support/browser';
test('reviewed structural and splat models use separate listing approval, public rendering and withdrawal',async({page,browser},info)=>{
 test.setTimeout(240000);const origin='http://localhost:8089',web='http://localhost:8088';await login(page,'agent',origin,'/ops');
 for(const modelType of ['structural','splat'] as const){
  const f=JSON.parse(readFileSync(`infra/generated/integration/model-publication-${modelType}-${info.project.name}.json`,'utf8'));
  await page.goto(`${origin}/ops/digitization?workspace=${f.engineId}`);const form=page.getByRole('region',{name:'Reviewed model publication',exact:true});await expect(form).toBeVisible();
  await form.getByRole('button',{name:'Refresh model publication status',exact:true}).click();await form.getByRole('combobox',{name:'Reviewed model candidate',exact:true}).selectOption(f.reviewId);
  await expect(form.getByRole('button',{name:'Propose reviewed model publication',exact:true})).toBeDisabled();
  await form.getByRole('textbox',{name:'Model publication reason',exact:true}).fill('Synthetic reviewed model publication journey; no real property or human acceptance claim.');
  await form.getByRole('checkbox',{name:'I authorize publication of this independently reviewed model visualization.',exact:true}).check();
  const pending=page.waitForResponse(response=>response.url().endsWith('/model-publication-proposals')&&response.request().method()==='POST');await form.getByRole('button',{name:'Propose reviewed model publication',exact:true}).click();const response=await pending;expect(response.status()).toBe(201);const proposal=(await response.json()).data;
  const staffContext=await browser.newContext({viewport:info.project.use.viewport}),staff=await staffContext.newPage();try{
   await login(staff,'moderator',origin,'/ops');const queueReady=staff.waitForResponse(response=>response.url().endsWith('/api/v1/ops/digitization-model-publication-reviews')&&response.request().method()==='GET',{timeout:40000});await staff.goto(origin+'/ops/reviews');const queueResponse=await queueReady;expect(queueResponse.status()).toBe(200);expect((await queueResponse.json()).data.some((row:{revisionId:string})=>row.revisionId===proposal.revisionId)).toBe(true);const article=staff.locator(`[data-model-publication-review-id="${proposal.revisionId}"]`);await expect(article).toBeVisible();
   await expect(article.getByRole('button',{name:'Approve model publication revision',exact:true})).toBeDisabled();
   await article.getByRole('button',{name:'Inspect publication model',exact:true}).click();await article.getByRole('button',{name:modelType==='structural'?'Open 3D preview':'Open scene preview',exact:true}).click();await expect(article.getByRole('status')).toContainText(modelType==='structural'?'Structural model loaded':'Scene loaded:',{timeout:30000});
   await article.getByRole('checkbox',{name:'I independently verified this exact reviewed model, privacy treatment, visualization limitations and current listing authority.',exact:true}).check();
   await article.getByRole('textbox',{name:'Model publication review reason',exact:true}).fill('Independent synthetic CI listing/model review; no human parity or measured-property approval.');
   const axe=await new AxeBuilder({page:staff}).include(`[data-model-publication-review-id="${proposal.revisionId}"]`).analyze();expect(axe.violations.filter(v=>v.impact==='critical'||v.impact==='serious')).toEqual([]);
   await article.getByRole('button',{name:'Approve model publication revision',exact:true}).click();await expect(article).toHaveCount(0);
  }finally{await staffContext.close();}
  const consumerContext=await browser.newContext({viewport:info.project.use.viewport}),consumer=await consumerContext.newPage();try{
   const manifestResponse=await consumer.request.get(`${web}/api/v1/listings/${f.listingId}/digitization-model`);expect(manifestResponse.status()).toBe(200);const model=(await manifestResponse.json()).data;expect(model).toMatchObject({viewerType:modelType,metricMeasurementsAvailable:false,scaleStatus:modelType==='structural'?'estimated':'unscaled'});for(const privateValue of [f.engineId,f.artifactId,f.sourceAssetId,f.geometryRevisionId])expect(JSON.stringify(model)).not.toContain(privateValue);
   const detail=(await (await consumer.request.get(`${web}/api/v1/listings/${f.listingId}`)).json()).data;await consumer.goto(`${web}/${detail.city}/buy/${detail.slug}`);
   await consumer.getByRole('button',{name:modelType==='structural'?'Explore reviewed structural model':'Explore reviewed reconstructed scene',exact:true}).click();const dialog=consumer.getByRole('dialog',{name:'Reviewed property model',exact:true});
   if(modelType==='splat')await dialog.getByRole('button',{name:'Open scene preview',exact:true}).click();await expect(dialog.getByRole('status')).toContainText(modelType==='structural'?'Structural model loaded':'Scene loaded:',{timeout:30000});
   await expect(dialog.getByRole('button',{name:'Measure scene performance',exact:true})).toHaveCount(0);await expect(dialog.getByText('Metric measurements are unavailable.',{exact:false})).toBeVisible();
   for(const width of [320,390,768,1440]){await consumer.setViewportSize({width,height:900});expect(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);}
   await dialog.screenshot({path:`evidence/digitization/published-model-${modelType}-${info.project.name}.png`});await consumer.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
   await form.getByRole('button',{name:'Refresh model publication status',exact:true}).click();await expect(form.getByRole('button',{name:'Withdraw published property model',exact:true})).toBeVisible();await form.getByRole('textbox',{name:'Model publication reason',exact:true}).fill('Withdraw the synthetic reviewed property model.');await form.getByRole('button',{name:'Withdraw published property model',exact:true}).click();await expect(form.getByRole('status')).toContainText('withdrawn from public requests');
   expect((await (await consumer.request.get(`${web}/api/v1/listings/${f.listingId}/digitization-model`)).json()).data).toBeNull();expect((await consumer.request.get(web+model.contentUrl)).status()).toBe(404);
  }finally{await consumerContext.close();}
 }
});
