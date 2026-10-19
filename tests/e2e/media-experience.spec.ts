import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import {uploadedModelFixture} from '../support/uploaded-model-fixture';
const root='/media-experience-fixtures/';
const rows=[
 {id:'photo-a',kind:'photo',title:'Living room',url:root+'living.png'},
 {id:'photo-b',kind:'photo',title:'Bedroom',url:root+'bedroom.png'},
 {id:'plan-a',kind:'floor_plan',title:'Apartment floor plan',url:root+'plan.png'},
 {id:'video-a',kind:'video',title:'Property walkthrough',url:root+'walkthrough.mp4',poster:root+'living.png'},
 {id:'model-a',kind:'model_3d',title:'Furnished 3D view',url:root+'plan.glb'},
 {id:'pano-a',kind:'panorama',title:'Living room panorama',url:root+'living.png'},
 {id:'pano-b',kind:'panorama',title:'Bedroom panorama',url:root+'bedroom.png'}
].map((row,index)=>({...row,position:index,caption:'Authored synthetic demonstration media.',width:2048,height:1024,hotspots:[],spatial:null,duration:null,poster:null,...row}));
test('fullscreen media has accessible controls, keyboard navigation and all five formats',async({page},info)=>{
 test.setTimeout(120000);
 await page.route('**/api/v1/listings/*/media',route=>route.fulfill({json:{data:rows}}));
 await page.route('**'+root+'*',route=>{const name=new URL(route.request().url()).pathname.split('/').pop();if(name==='plan.glb')return route.fulfill({contentType:'model/gltf-binary',body:uploadedModelFixture()});const file=name==='plan.png'?'property-plan.png':name==='walkthrough.mp4'?'property-demo.mp4':name==='bedroom.png'?'panorama-bedroom.png':'panorama-living.png';return route.fulfill({contentType:name?.endsWith('.mp4')?'video/mp4':'image/png',body:fs.readFileSync('packages/test-support/assets/'+file)});});
 const response=await page.request.get('/api/v1/listings?city=bj&transaction=sale&segment=residential&limit=1');const listing=(await response.json()).data[0];expect(listing).toBeTruthy();
 await page.goto('/bj/buy/'+listing.slug);
 await page.getByRole('button',{name:'Open property gallery',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Property media viewer',exact:true}),formats=dialog.getByRole('navigation',{name:'Media viewer formats'});
 await expect(dialog).toBeVisible();const box=await dialog.boundingBox();expect(box!.width).toBe(page.viewportSize()!.width);expect(box!.height).toBe(page.viewportSize()!.height);
 await page.keyboard.press('ArrowRight');await expect(dialog.getByLabel('Property image').getByRole('img')).toBeVisible();
 await dialog.getByRole('button',{name:'Zoom in image',exact:true}).click();await expect(dialog.getByRole('group',{name:'Image zoom'})).toContainText('125%');await dialog.getByRole('button',{name:'Fit image',exact:true}).click();
 await formats.getByRole('button',{name:'Videos'}).click();const video=dialog.locator('video');await expect(video).toBeVisible();await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.readyState)).toBeGreaterThan(0);expect(await video.evaluate((v:HTMLVideoElement)=>v.paused)).toBe(true);
 await formats.getByRole('button',{name:'Floor plans'}).click();await expect(video).toHaveCount(0);await expect(dialog.getByRole('button',{name:'Fit plan',exact:true})).toBeVisible();await dialog.getByRole('button',{name:'Zoom in',exact:true}).click();await expect(dialog.locator('.plan-controls')).toContainText('125%');
 await formats.getByRole('button',{name:'3D view'}).click();await expect(dialog.getByLabel('Uploaded 3D plan canvas')).toBeVisible();await dialog.getByRole('button',{name:'Reset 3D view',exact:true}).click();
 await formats.getByRole('button',{name:'360° tour'}).click();await expect(dialog.getByRole('img',{name:'360 degree view: Living room panorama',exact:true})).toHaveAttribute('data-panorama-ready','true');await dialog.getByRole('button',{name:'Bedroom panorama',exact:true}).click();await expect(dialog.getByRole('img',{name:'360 degree view: Bedroom panorama',exact:true})).toHaveAttribute('data-panorama-ready','true');
 await formats.getByRole('button',{name:'Photos'}).click();await dialog.getByRole('button',{name:'View Living room',exact:true}).click();
 const accessibility=await new AxeBuilder({page}).include('.media-experience-dialog').analyze();expect(accessibility.violations.filter(issue=>['serious','critical'].includes(issue.impact||''))).toEqual([]);
 await page.screenshot({path:'evidence/media-experience/fullscreen-'+info.project.name+'.png'});
 await dialog.getByRole('button',{name:'Media information',exact:true}).click();const informationAudit=await new AxeBuilder({page}).include('.experience-information').analyze();expect(informationAudit.violations.filter(issue=>['serious','critical'].includes(issue.impact||''))).toEqual([]);
 await dialog.getByRole('button',{name:'Media information',exact:true}).click();
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(page.getByRole('button',{name:'Open property gallery',exact:true})).toBeFocused();
 if(info.project.name==='mobile'){
  await page.setViewportSize({width:320,height:568});await page.getByRole('button',{name:'Open property gallery',exact:true}).click();await expect(dialog).toBeVisible();expect(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);await formats.getByRole('button',{name:'3D view'}).click();await expect(dialog.getByLabel('Uploaded 3D plan canvas')).toBeVisible();await dialog.getByRole('button',{name:'Close dialog',exact:true}).click();
 }
});
