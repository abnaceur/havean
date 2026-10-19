import {test,expect} from '@playwright/test';
import {login,apiRequest} from '../support/browser';
import {uploadedModelFixture} from '../support/uploaded-model-fixture';
const origin='http://localhost:8089';
test('agent requires photos and plan, uploads optional 360 and 3D, and engine stays disabled',async({page,browser},info)=>{
 test.setTimeout(240000);page.setDefaultTimeout(20000);
 await login(page,'agent',origin,'/ops/listings');
 await expect(page.getByRole('button',{name:'Digitize property',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Create property draft',exact:true}).click();
 await page.getByLabel('Existing property unit',{exact:true}).selectOption('10000000-0000-4000-8000-000000001000');
 const title='Manual media '+info.project.name+' '+crypto.randomUUID();
 await page.getByLabel('Property title',{exact:true}).fill(title);await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByLabel('Property description',{exact:true}).fill('A synthetic property used to verify the manual media upload workflow.');await page.getByLabel('Asking price (decimal amount)',{exact:true}).fill('2450000.75');
 await page.getByRole('button',{name:'Continue',exact:true}).click();
 const dialog=page.locator('dialog.property-wizard-dialog');await expect(dialog.getByRole('heading',{name:'Photos & media',exact:true})).toBeVisible();
 const records=(await (await page.request.get(origin+'/api/v1/ops/listings')).json()).data,listing=records.find((r:any)=>r.title===title);expect(listing).toBeTruthy();
 const state=async()=>(await (await page.request.get(origin+'/api/v1/ops/listings/'+listing.id+'/media')).json()).data;
 const submit=async()=>apiRequest(page,'/ops/listings/'+listing.id+'/transition',{status:'submitted',version:(await state()).listing.version});
 expect((await submit()).status()).toBe(409);
 const upload=async(kind:string,file:string|{name:string;mimeType:string;buffer:Buffer})=>{
  await dialog.getByLabel('Media type',{exact:true}).selectOption(kind);await dialog.getByLabel('Media title',{exact:true}).fill(kind+' '+title);await dialog.getByLabel('Rights / source',{exact:true}).fill('Project authored synthetic test fixture');await dialog.getByLabel('Property media file',{exact:true}).setInputFiles(file);await dialog.getByRole('checkbox',{name:'I have the rights and permission to publish this media.',exact:true}).check();await dialog.getByRole('button',{name:'Upload and submit for review',exact:true}).click();await expect(dialog.getByRole('status').filter({hasText:'Upload prepared and submitted for moderation.'})).toBeVisible();
 };
 await upload('photo','packages/test-support/assets/property-plan.png');expect((await submit()).status()).toBe(409);
 await upload('floor_plan','packages/test-support/assets/property-plan.png');
 await upload('panorama','packages/test-support/assets/panorama-living.png');
 await upload('model_3d',{name:'plan.glb',mimeType:'application/octet-stream',buffer:uploadedModelFixture()});
 const media=(await state()).media,model=media.find((m:any)=>m.kind==='model_3d');expect(model).toBeTruthy();
 await dialog.getByRole('button',{name:'Preview 3D plan',exact:true}).click();await expect(dialog.getByLabel('Uploaded 3D plan canvas')).toBeVisible();
 const anonymous=await browser.newContext();try{expect((await anonymous.request.get(origin+'/api/v1/media/'+model.asset_id+'/model')).status()).toBe(404);}finally{await anonymous.close();}
 await dialog.getByRole('button',{name:'Save & exit',exact:true}).click();await expect(dialog).toHaveCount(0);expect((await submit()).status()).toBe(201); // No video is required.
 const required=media.find((m:any)=>m.kind==='floor_plan');expect((await apiRequest(page,'/ops/property-media/'+required.id,{version:required.version},'DELETE')).status()).toBe(409);
 expect((await apiRequest(page,'/ops/listings/'+listing.id+'/digitization',{listingVersion:(await state()).listing.version,authorityConfirmed:true})).status()).toBe(503);
 const moderatorContext=await browser.newContext(),moderator=await moderatorContext.newPage();
 try{
  await login(moderator,'moderator',origin,'/ops/reviews');
  let current=(await state()).listing;
  expect((await apiRequest(moderator,'/ops/listings/'+listing.id+'/transition',{status:'under_review',version:current.version})).status()).toBe(201);
  current=(await state()).listing;expect((await apiRequest(moderator,'/ops/listings/'+listing.id+'/transition',{status:'published',version:current.version,verified:true})).status()).toBe(409);
  for(const item of media)expect((await apiRequest(moderator,'/ops/property-media/'+item.id+'/review',{decision:'approved',reason:'Reviewed synthetic media and rights',version:item.version})).status()).toBe(201);
  current=(await state()).listing;expect((await apiRequest(moderator,'/ops/listings/'+listing.id+'/transition',{status:'published',version:current.version,verified:true})).status()).toBe(201);
 }finally{await moderatorContext.close();}
 const publicContext=await browser.newContext({viewport:page.viewportSize()!,isMobile:!!info.project.use.isMobile,hasTouch:!!info.project.use.hasTouch}),consumer=await publicContext.newPage();consumer.setDefaultTimeout(20000);try{
  const response=await consumer.request.get(origin+'/api/v1/media/'+model.asset_id+'/model');expect(response.status()).toBe(200);expect(response.headers()['content-type']).toContain('model/gltf-binary');
  await consumer.goto('http://localhost:8088/bj/buy/'+listing.slug);
  await consumer.getByRole('button',{name:'Uploaded 3D plans (1)',exact:true}).click();await consumer.getByRole('button',{name:'Preview 3D plan',exact:true}).click();await expect(consumer.getByLabel('Uploaded 3D plan canvas')).toBeVisible();await consumer.screenshot({path:'evidence/property-media-update/public-'+info.project.name+'.png',fullPage:true});
 }finally{await publicContext.close();}
 await page.goto(origin+'/ops/digitization');await expect(page.getByRole('heading',{name:'Digitalization is temporarily disabled',exact:true})).toBeVisible();
});
