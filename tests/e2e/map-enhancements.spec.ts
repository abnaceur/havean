import '../support/env';
import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('price pin previews and selected panel retain map filters and support keyboard/mobile',async({page},info)=>{
 await page.goto('/bj/map?transaction=sale&segment=residential&sort=newest');
 await expect(page.locator('.map-canvas')).toHaveAttribute('data-map-ready','true');
 // Read actual public locations and select through the accessible map picker.
 const response=await page.request.get('/api/v1/listings/map?city=bj&transaction=sale&segment=residential');
 expect(response.ok()).toBe(true);
 const points=(await response.json()).data;
 const picker=page.getByLabel('Select a property on the map');await expect(picker.locator('option')).not.toHaveCount(1);
 const id=await picker.locator('option').nth(1).getAttribute('value');expect(id).toBeTruthy();
 await picker.selectOption(id!);
 const panel=page.getByRole('region',{name:'Selected property',exact:true});await expect(panel).toBeVisible();await expect(panel.locator('.listing-card')).toBeVisible();
 const original=page.url();const positions=()=>page.locator('.maplibregl-marker').evaluateAll(elements=>elements.map(e=>[e.textContent,(e as HTMLElement).style.transform]).sort((a,b)=>String(a).localeCompare(String(b))));const before=await positions();
 if(info.project.name==='mobile'){
  await page.getByRole('button',{name:'Expand details',exact:true}).click();await expect(page.getByRole('button',{name:'Collapse details',exact:true})).toHaveAttribute('aria-expanded','true');
  expect(await panel.evaluate(e=>getComputedStyle(e).position)).toBe('fixed');
 }else expect(await panel.evaluate(e=>getComputedStyle(e).position)).toBe('sticky');
 await page.getByRole('button',{name:'Close property details',exact:true}).click();await expect(panel).toHaveCount(0);expect(page.url()).toBe(original);
 await expect.poll(positions).toEqual(before);
 // Zooming separates clusters without changing the applied URL filters.
 for(let i=0;i<6&&await page.locator('.map-price-pin').count()===0;i++){await page.locator('.map-cluster-count').first().click();await page.getByRole('button',{name:'Close area properties',exact:true}).click();await expect(page.locator('.map-price-pin').first()).toBeVisible({timeout:5000}).catch(()=>{});}
 const pin=page.locator('.map-price-pin').last();await expect(pin).toBeVisible();await pin.focus();
 const preview=page.getByRole('region',{name:'Property preview',exact:true});await expect(preview).toBeVisible();
 await pin.press('Escape');await expect(preview).toHaveCount(0);
 await pin.blur();await pin.focus();await expect(preview).toBeVisible();
 if(info.project.name==='desktop'){await pin.hover();await preview.hover();await expect(preview).toBeVisible();}
 await preview.getByRole('button',{name:'Show property details',exact:true}).click();await expect(panel).toBeVisible();await expect(panel.getByRole('link',{name:'View full property',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Close property details',exact:true})).toBeFocused();
 await expect(panel.locator('.listing-card')).toBeVisible();await page.screenshot({path:info.outputPath('selected-property.png')});
 await page.getByRole('button',{name:'Close property details',exact:true}).press('Escape');await expect(panel).toHaveCount(0);await expect(pin).toBeFocused();
 await page.getByLabel('Select a property on the map').selectOption(id!);await expect(panel).toBeVisible();
 await page.getByLabel('Property transaction',{exact:true}).selectOption('rent');await expect(page).toHaveURL(/transaction=rent/);await expect(panel).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const axe=await new AxeBuilder({page}).include('main').analyze();expect(axe.violations.filter(v=>['serious','critical'].includes(v.impact||''))).toEqual([]);
 await page.screenshot({path:info.outputPath('map-enhancements.png')});
 expect(points.length).toBeGreaterThan(0);
});
