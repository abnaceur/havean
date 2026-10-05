import '../support/env';
import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../packages/database/package.json',import.meta.url)),{Pool}=require('pg');
const fixtures=new Pool({connectionString:process.env.DATABASE_URL});
import {login,apiRequest} from '../support/browser';
test.afterAll(()=>fixtures.end());
async function cardIds(page:any){return page.locator('.listing-card').evaluateAll((cards:HTMLElement[])=>cards.map(card=>card.dataset.listingId));}
test('D04 combined filters return independent SQL fixture IDs; Cancel, Reset, validation, Refresh and Back preserve applied criteria',async({page},info)=>{
 const expected=(await fixtures.query(`SELECT id FROM public_listings WHERE city='bj' AND transaction='sale' AND segment='residential' AND price::numeric BETWEEN 0 AND 4000000 AND beds IN(1,2) AND district IN('Chaoyang','Haidian') AND features && ARRAY['Garden views','Near metro'] ORDER BY price::numeric,id LIMIT 20`)).rows.map(row=>row.id);expect(expected.length).toBeGreaterThan(0);
 await page.goto('/bj/buy');await page.getByRole('button',{name:'All filters',exact:true}).click();await page.getByRole('button',{name:'More property filters',exact:true}).click();
 for(const label of ['Chaoyang','Haidian','Include 1 bedroom','Include 2 bedrooms','Garden views','Near metro'])await page.getByRole('checkbox',{name:label,exact:true}).check();
 await page.getByRole('button',{name:'Up to 4 million',exact:true}).click();await expect(page.getByLabel('Minimum price (CNY)',{exact:true})).toHaveValue('0');await expect(page.getByLabel('Maximum price (CNY)',{exact:true})).toHaveValue('4000000');
 const axe=await new AxeBuilder({page}).include('dialog').analyze();expect(axe.violations.filter(v=>['serious','critical'].includes(v.impact||''))).toEqual([]);
 await page.screenshot({path:`evidence/d04-advanced-${info.project.name}.png`});
 await page.getByRole('button',{name:'Apply filters',exact:true}).click();await expect(page).toHaveURL(/beds=1%2C2/);await page.getByRole('combobox',{name:'Sort properties'}).selectOption('price_asc');await expect(page).toHaveURL(/sort=price_asc/);await expect.poll(()=>cardIds(page)).toEqual(expected);
 const applied=page.url();await page.reload();await expect.poll(()=>cardIds(page)).toEqual(expected);expect(page.url()).toBe(applied);
 await page.getByRole('button',{name:/All filters/}).click();await page.getByLabel('Minimum price (CNY)',{exact:true}).fill('999');await page.getByLabel('Maximum price (CNY)',{exact:true}).fill('10');await page.getByRole('button',{name:'Apply filters',exact:true}).click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Minimum price must not exceed maximum price');expect(page.url()).toBe(applied);
 await page.getByRole('button',{name:'Reset',exact:true}).click();await expect(page.getByLabel('Minimum price (CNY)',{exact:true})).toHaveValue('');expect(page.url()).toBe(applied);await page.getByRole('button',{name:'Close dialog',exact:true}).click();expect(page.url()).toBe(applied);await expect.poll(()=>cardIds(page)).toEqual(expected);
 await page.getByRole('button',{name:/All filters/}).click();await expect(page.getByRole('checkbox',{name:'Include 1 bedroom',exact:true})).toBeChecked();await page.getByRole('checkbox',{name:'Include 1 bedroom',exact:true}).uncheck();await page.getByRole('button',{name:'Close dialog',exact:true}).click();expect(page.url()).toBe(applied);await expect.poll(()=>cardIds(page)).toEqual(expected);
 await page.getByRole('combobox',{name:'Sort properties'}).selectOption('price_desc');await expect(page).toHaveURL(/sort=price_desc/);await page.goBack();await expect(page).toHaveURL(applied);await expect.poll(()=>cardIds(page)).toEqual(expected);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
test('D04 administrators author decimal price ranges that consumers can apply; bad ranges are rejected',async({page},info)=>{
 test.setTimeout(180000);await login(page,'admin','http://localhost:8089','/ops/geography');
 const original=(await (await page.request.get('http://localhost:8089/api/v1/config?city=bj')).json()).data;const label='Precise range '+info.project.name+' '+crypto.randomUUID();
 try{
  await page.getByRole('button',{name:'Add price range',exact:true}).click();const row=page.locator('.price-preset-editor fieldset').last();await row.getByLabel('Range label',{exact:true}).fill(label);await row.getByLabel('Minimum amount',{exact:true}).fill('3200000.01');await row.getByLabel('Maximum amount',{exact:true}).fill('3200000.99');await page.getByRole('button',{name:'Save market settings',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Market settings saved'})).toBeVisible();
  const updated=(await (await page.request.get('http://localhost:8089/api/v1/config?city=bj')).json()).data;expect(updated.data.pricePresets).toContainEqual({label,transaction:'sale',min:'3200000.01',max:'3200000.99'});
  const invalid=await apiRequest(page,'/ops/cities/bj/market',{...updated.data,pricePresets:[{label:'Bad range',transaction:'sale',min:'2',max:'1'}],version:updated.version},'PATCH');expect(invalid.status()).toBe(400);
  await page.goto('http://localhost:8088/bj/buy');await page.getByRole('button',{name:'All filters',exact:true}).click();await page.getByRole('button',{name:'More property filters',exact:true}).click();await page.getByRole('button',{name:label,exact:true}).click();await expect(page.getByLabel('Minimum price (CNY)',{exact:true})).toHaveValue('3200000.01');await expect(page.getByLabel('Maximum price (CNY)',{exact:true})).toHaveValue('3200000.99');await page.getByRole('button',{name:'Apply filters',exact:true}).click();await expect(page).toHaveURL(/minPrice=3200000.01/);await expect(page.locator('.listing-card')).toHaveCount(0);
 }finally{const fresh=(await (await page.request.get('http://localhost:8089/api/v1/config?city=bj')).json()).data;const restored=await apiRequest(page,'/ops/cities/bj/market',{...original.data,version:fresh.version},'PATCH');expect(restored.ok()).toBe(true);}
});
