import {chromium,expect} from '@playwright/test';
import fs from 'node:fs';
const origin=process.env.SPATIAL_DEMO_ORIGIN||'http://localhost:8088';
const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const context=await browser.newContext();
 const rows=(await (await context.request.get(origin+'/api/v1/listings/home-1/media')).json()).data;
 const plan=rows.find((row:any)=>row.spatial?.rooms.length&&row.spatial.level===0);
 if(!plan)throw new Error('The demo needs an approved ground floor with mapped panorama viewpoints');
 const tourUrl=origin+'/bj/buy/home-1?media=vr&floor='+plan.id,planUrl=origin+'/bj/buy/home-1?media=plan&floor='+plan.id;
 const otherFloor=rows.find((row:any)=>row.spatial?.rooms.length&&row.spatial.name==='Upper floor (illustration)');
 await context.close();
 for(const [name,viewport] of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]] as const){
  const context=await browser.newContext({viewport});const page=await context.newPage();
  await page.goto(origin+'/bj/buy/home-1');await expect(page.getByRole('group',{name:'Property media',exact:true})).toBeVisible();
  await page.screenshot({path:'evidence/spatial-demo-gallery-'+name+'.png'});
  await page.goto(tourUrl);const dialog=page.getByRole('dialog',{name:'Interactive property tour'});
  await expect(dialog.getByRole('img',{name:/360 degree view:/})).toBeVisible();
  await expect(dialog.getByRole('group',{name:'Tour position and direction'})).toBeVisible();
  await page.screenshot({path:'evidence/spatial-demo-tour-'+name+'.png'});
  await dialog.getByRole('button',{name:'3D model',exact:true}).click();
  await expect(dialog.getByRole('status').filter({hasText:'3D model ready'})).toHaveText(/3D model ready/);
  if(otherFloor){await dialog.getByLabel('Tour floor',{exact:true}).selectOption(otherFloor.id);await dialog.getByLabel('Tour floor',{exact:true}).selectOption('all');await expect(dialog.locator('.model-room')).toHaveCount(plan.spatial.rooms.length+otherFloor.spatial.rooms.length);}
  await page.screenshot({path:'evidence/spatial-demo-model-'+name+'.png'});
  await page.goto(planUrl);
  await expect(page.getByRole('dialog',{name:'Interactive property tour'}).getByRole('img',{name:plan.title,exact:true})).toBeVisible();
  await page.screenshot({path:'evidence/spatial-demo-plan-'+name+'.png'});
  await context.close();
 }

 fs.writeFileSync('evidence/spatial-demo.json',JSON.stringify({evidenceLabel:'P',synthetic:true,propertyUrl:origin+'/bj/buy/home-1',tourUrl,planUrl,groundFloorId:plan.id,upperFloorId:otherFloor?.id||null,renderer:browser.version(),verifiedViewports:[1440,390],modelSource:'Approved synthetic plan geometry, not a scan'},null,2)+'\n');
 console.log('Approved demo tour, plan and 3D model verified at desktop and mobile widths.');
}finally{await browser.close();}
