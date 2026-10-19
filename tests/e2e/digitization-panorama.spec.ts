import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {login} from '../support/browser';
test('HE-G03 real private candidate review preserves empty fields, keyboard, retry and cleanup',async({page},info)=>{
 const fixture=JSON.parse(readFileSync(`infra/generated/integration/plan-editor-panorama-${info.project.name}.json`,'utf8')),origin='http://localhost:8089';
 await login(page,'agent',origin,'/ops');await page.goto(origin+'/ops/digitization?workspace='+fixture.engineId);
 const review=page.getByRole('region',{name:'Private panorama capture review'});
 await review.getByRole('button',{name:'Review private captures',exact:true}).click();
 await expect(review.getByLabel('Capture name',{exact:true})).toHaveValue('');await expect(review.getByLabel('Supplied heading (degrees)',{exact:true})).toHaveValue('');
 const canvas=review.getByRole('img',{name:'360 degree view: Private capture preview',exact:true});await expect(canvas).toHaveAttribute('data-panorama-ready','true');
 await canvas.focus();await canvas.press('ArrowRight');await expect(review.getByText(/View 10°/)).toBeVisible();
 if(info.project.name==='mobile'){
  await canvas.scrollIntoViewIfNeeded();const box=(await canvas.boundingBox())!,cdp=await page.context().newCDPSession(page);try{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+100,y:box.y+100,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+140,y:box.y+100,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}finally{await cdp.detach();}await expect(review.getByText(/View 0°/)).toBeVisible();
 }
 await review.getByLabel('Capture name',{exact:true}).fill('Synthetic private capture');await review.getByRole('button',{name:'Save private tour',exact:true}).click();await expect(review.getByRole('status').filter({hasText:'Private tour saved.'})).toBeVisible();
 const saved=(await (await page.request.get(origin+'/api/v1/ops/digitizations/'+fixture.engineId+'/tour-revisions/latest')).json()).data;expect(saved).toMatchObject({reviewRequired:true,genuinePanoramaConfirmed:false});expect(saved.graph.nodes[0]).toMatchObject({headingDegrees:null,roomId:null,captureDeclaration:null});
 await review.getByRole('button',{name:'Close capture previews',exact:true}).click();await expect(review.locator('canvas')).toHaveCount(0);await expect(review.getByRole('button',{name:'Review private captures',exact:true})).toBeFocused();
 const route='**/artifacts/*/preview';await page.route(route,r=>r.fulfill({status:403,body:'PRIVATE-SENTINEL'}));await review.getByRole('button',{name:'Review private captures',exact:true}).click();await expect(review.getByText('The panorama could not be loaded. Choose another scene or try again.',{exact:true})).toBeVisible();expect(await review.innerText()).not.toContain('PRIVATE-SENTINEL');
 await page.unroute(route);await review.getByRole('button',{name:'Retry panorama',exact:true}).click();await expect(review.getByRole('img',{name:'360 degree view: Synthetic private capture',exact:true})).toHaveAttribute('data-panorama-ready','true');
 await review.getByRole('img',{name:'360 degree view: Synthetic private capture',exact:true}).press('Escape');await expect(review.locator('canvas')).toHaveCount(0);
});
test('HE-G03 private review uses actual image fallback when WebGL is unavailable',async({page},info)=>{
 const fixture=JSON.parse(readFileSync(`infra/generated/integration/plan-editor-panorama-${info.project.name}.json`,'utf8')),origin='http://localhost:8089';
 await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind:string,...args:unknown[]){if(kind==='webgl')return null;return original.call(this,kind,...args);} as typeof original;});
 await login(page,'agent',origin,'/ops');await page.goto(origin+'/ops/digitization?workspace='+fixture.engineId);const review=page.getByRole('region',{name:'Private panorama capture review'});await review.getByRole('button',{name:'Review private captures',exact:true}).click();
 await expect(review.getByText('Interactive rendering is unavailable. The panorama image is shown below.',{exact:true})).toBeVisible();const image=review.locator('img.panorama-fallback');await expect(image).toBeVisible();await expect.poll(()=>image.evaluate((image:HTMLImageElement)=>image.naturalWidth)).toBeGreaterThan(0);await review.getByRole('button',{name:'Close capture previews',exact:true}).click();await expect(image).toHaveCount(0);
});
