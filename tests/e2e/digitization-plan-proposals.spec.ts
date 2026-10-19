import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {login} from '../support/browser';
test('source ink suggestions remain editable, unscaled and unconfirmed across a private save and reload',async({page},info)=>{
 const fixture=JSON.parse(readFileSync(`infra/generated/integration/plan-editor-${info.project.name}.json`,'utf8')),origin='http://localhost:8089',route=origin+'/api/v1/ops/digitizations/'+fixture.engineId+'/geometry';
 await login(page,'agent',origin,'/ops');await page.goto(origin+'/ops/digitization?workspace='+fixture.engineId);
 const canvas=page.getByRole('img',{name:'Plan drawing canvas'});await expect(canvas).toBeVisible();
 await page.getByRole('button',{name:'Suggest source lines',exact:true}).click();
 await expect(page.getByText(/unconfirmed ink-line suggestions added/)).toBeVisible();
 const count=await canvas.locator('line[data-wall-id]').count();expect(count).toBeGreaterThan(0);expect(count).toBeLessThanOrEqual(200);
 await page.getByRole('button',{name:'Save private trace',exact:true}).click();await expect(page.getByText('Private trace saved.',{exact:true})).toBeVisible();
 const read=async()=>{const response=await page.request.get(route);expect(response.status()).toBe(200);return (await response.json()).data;};
 const saved=await read();expect(saved.geometry.unit).toBe('px');expect(saved.geometry.scaleStatus).toBe('unscaled');expect(saved.geometry.review.status).toBe('pending');
 expect(saved.geometry.walls.every((w:any)=>w.confirmed===false&&w.height===null&&w.source.assetId===fixture.sourceAssetId&&w.source.page===1)).toBe(true);
 await page.reload();await expect(canvas.locator('line[data-wall-id]')).toHaveCount(count);
 await page.getByLabel('Wall 1',{exact:true}).check();await page.getByRole('button',{name:'Delete selected wall',exact:true}).click();await expect(canvas.locator('line[data-wall-id]')).toHaveCount(count-1);
 await page.getByRole('button',{name:'Save private trace',exact:true}).click();await expect.poll(async()=>(await read()).geometry.revision).toBe(2);
 expect((await read()).geometry.walls).toHaveLength(count-1);
});
