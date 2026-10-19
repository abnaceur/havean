import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import {login} from '../support/browser';
test('independent selected-camera review enables scoped private viewpoints and refuses obsolete approval',async({page,browser},info)=>{
 test.setTimeout(180000);
 const f=JSON.parse(readFileSync(`infra/generated/integration/registration-review-${info.project.name}.json`,'utf8')),origin='http://localhost:8089';
 await login(page,'agent',origin,'/ops');
 const request=async(path:string,data:unknown)=>page.request.post(origin+'/api/v1'+path,{headers:{Origin:origin,'Idempotency-Key':crypto.randomUUID()},data});
 const observations=(await (await page.request.get(`${origin}/api/v1/ops/digitizations/${f.engineId}/scene-registrations`)).json()).data[0];
 const workspace=(await (await page.request.get(`${origin}/api/v1/ops/digitizations/${f.engineId}`)).json()).data;
 const input={version:workspace.version,inputRevision:workspace.inputRevision,sceneArtifactId:f.artifactId,geometryRevisionId:f.geometryRevisionId,floorId:'ground',anchors:observations.anchors,cameraAnchors:observations.cameraAnchors.map(({planPosition:_position,...camera}:any)=>camera),note:'Authored independent browser review fixture, no real property acceptance.'};
 expect((await request(`/ops/digitizations/${f.engineId}/scene-registrations`,input)).status()).toBe(201);
 await page.goto(origin+'/ops/digitization?workspace='+f.engineId);
 const registration=page.getByRole('region',{name:'Scene registration and camera anchors'}),form=registration.getByRole('group',{name:'Independent camera registration review',exact:true});
 await expect(form).toBeVisible();await form.getByRole('combobox',{name:'Assigned registration reviewer',exact:true}).selectOption('00000000-0000-4000-8000-000000000008');
 await expect(form.getByRole('button',{name:'Request independent registration review',exact:true})).toBeDisabled();
 await form.getByRole('checkbox',{name:'I own the current source assets and share their private scene and plan previews with this reviewer.',exact:true}).check();
 const pending=page.waitForResponse(response=>response.url().endsWith('/registration-review-requests')&&response.request().method()==='POST');await form.getByRole('button',{name:'Request independent registration review',exact:true}).click();const response=await pending;expect(response.status()).toBe(201);const shared=(await response.json()).data;
 const context=await browser.newContext(),staff=await context.newPage();try{
  await login(staff,'moderator',origin,'/ops');await staff.goto(origin+'/ops/reviews');const article=staff.locator(`[data-registration-review-id="${shared.id}"]`);await expect(article).toBeVisible();
  await article.getByRole('button',{name:'Open shared floor plan',exact:true}).click();const image=article.getByRole('img',{name:'Shared registration floor plan',exact:true});await expect.poll(()=>image.evaluate((image:HTMLImageElement)=>image.naturalWidth)).toBeGreaterThan(0);
  await article.getByRole('button',{name:'Open scene preview',exact:true}).click();await expect(article.getByRole('status')).toContainText('Scene loaded:',{timeout:30000});
  await expect(article.getByRole('button',{name:'Approve selected camera viewpoints',exact:true})).toBeDisabled();
  await article.getByRole('checkbox',{name:/^Approve camera Observed/}).check();
  await article.getByRole('checkbox',{name:'I independently verified the observed scene-to-plan transform.',exact:true}).check();
  await article.getByRole('checkbox',{name:'I verified the selected camera positions against the shared scene and floor plan.',exact:true}).check();
  await article.getByRole('textbox',{name:'Registration review reason',exact:true}).fill('Synthetic automated review only; no human approval or actual property measurement.');
  const axe=await new AxeBuilder({page:staff}).include(`[data-registration-review-id="${shared.id}"]`).analyze();expect(axe.violations.filter(v=>v.impact==='critical'||v.impact==='serious')).toEqual([]);
  await article.screenshot({path:`evidence/digitization/registration-review-${info.project.name}.png`});
  await article.getByRole('button',{name:'Approve selected camera viewpoints',exact:true}).click();await expect(article).toHaveCount(0);
 }finally{await context.close();}
 await page.reload();const panel=page.getByRole('region',{name:'Private scene viewpoints'});await expect(panel.getByRole('list',{name:'Approved floor camera positions'}).getByRole('listitem')).toHaveCount(1);
 await panel.getByRole('button',{name:'Open scene preview',exact:true}).click();await expect(panel.getByRole('status')).toContainText('Scene loaded:',{timeout:30000});
 const canvas=panel.getByLabel('Private reconstructed scene',{exact:true}),before=await canvas.screenshot();await panel.getByRole('button',{name:'View Observed room viewpoint',exact:true}).click();await expect(panel.getByRole('status')).toContainText('Approved private viewpoint selected.');expect((await canvas.screenshot()).equals(before)).toBe(false);
 await canvas.focus();await canvas.press('ArrowLeft');await canvas.press('Home');await panel.getByRole('button',{name:'Reset scene view',exact:true}).click();
 for(const width of [320,375,390,768,1440]){await page.setViewportSize({width,height:900});expect(await panel.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);}
 const current=(await (await page.request.get(`${origin}/api/v1/ops/digitizations/${f.engineId}`)).json()).data;expect((await request(`/ops/digitizations/${f.engineId}/scene-registrations`,{...input,version:current.version})).status()).toBe(201);
 await panel.getByRole('button',{name:'View Observed room viewpoint',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('Viewpoint approval changed.');await expect(panel.getByRole('navigation',{name:'Approved private camera viewpoints'})).toHaveCount(0);
 const anonymous=await browser.newContext();try{expect((await anonymous.request.get(`${origin}/api/v1/ops/digitization-registration-reviews/${shared.id}/scene/content`)).status()).toBe(401);}finally{await anonymous.close();}
});
