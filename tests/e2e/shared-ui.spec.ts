import {test,expect} from '@playwright/test';
import {login} from '../support/browser';
import {priceLabel} from '../../packages/contracts/src/domain';
test('U02 long English labels remain usable at 320 pixels',async({page},info)=>{
 await page.setViewportSize({width:320,height:812});await page.goto('/bj/buy');
 await page.getByRole('button',{name:'All filters',exact:true}).click();
 await page.locator('.dialog-head h2').evaluate(node=>node.textContent='Choose your preferred neighborhood, property characteristics and monthly accommodation budget');
 await page.getByRole('button',{name:'Apply filters',exact:true}).evaluate(node=>node.childNodes[0].textContent='Apply all selected property preferences and return to available homes');
 await expect(page.getByRole('dialog')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=320)).toBe(true);
 expect(await page.getByRole('dialog').evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
 const button=page.getByRole('button',{name:'Apply all selected property preferences and return to available homes',exact:true});const box=await button.boundingBox();expect(box!.width).toBeGreaterThanOrEqual(44);expect(box!.height).toBeGreaterThanOrEqual(44);
 await page.screenshot({path:`evidence/long-English-320-${info.project.name}.png`,fullPage:true});
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('U03 keyboard filter dismissal restores focus and Back restores filters and scroll',async({page},info)=>{
 await page.goto('/bj/buy?beds=2');const filters=page.getByRole('button',{name:/All filters/});await filters.focus();await page.keyboard.press('Enter');await expect(page.getByRole('dialog')).toBeVisible();
 await page.getByRole('combobox',{name:'Bedrooms',exact:true}).focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(filters).toBeFocused();await expect(page).toHaveURL(/beds=2/);
 const link=page.locator('.listing-card .card-title').nth(3);await link.scrollIntoViewIfNeeded();const scroll=await page.evaluate(()=>window.scrollY);const href=await link.getAttribute('href');await link.click();await expect(page).toHaveURL(new RegExp(href!+'$'));await page.goBack();await expect(page).toHaveURL(/beds=2/);await expect(page.locator('.listing-card')).not.toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeGreaterThanOrEqual(scroll-10);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`evidence/shared-shell-${info.project.name}.png`,fullPage:true});
});
test('U04 card amounts, rental basis, missing media and keyboard favorite targets',async({page})=>{
 await login(page,'buyer');await page.goto('/bj/buy');const first=page.locator('.listing-card').first();const listing=(await (await page.request.get('/api/v1/listings?city=bj&transaction=sale&segment=residential')).json()).data[0];await expect(first.locator('.card-bottom strong')).toHaveText(priceLabel(listing.price,listing.currency,listing.rentPeriod));await expect(first.locator('.card-facts')).toContainText(listing.beds+' beds · '+listing.livingRooms+' living');
 const before=page.url();const favorite=first.locator('.favorite-button');await favorite.focus();await page.keyboard.press('Enter');await expect(page.locator('.toast')).toBeVisible();expect(page.url()).toBe(before);
 await page.goto('/bj/rent');const rent=(await (await page.request.get('/api/v1/listings?city=bj&transaction=rent&segment=residential')).json()).data[0];await expect(page.locator('.listing-card').first().locator('.card-bottom strong')).toHaveText(priceLabel(rent.price,rent.currency,rent.rentPeriod));expect(rent.rentPeriod).toBeTruthy();
 await page.goto('/bj/commercial');await expect(page.locator('.listing-card').filter({has:page.locator('a[href="/bj/commercial/workspace-101"]')}).locator('.card-bottom strong')).toHaveText('Price on request');await expect(page.locator('.photo-fallback').first()).toContainText('Photo unavailable');
});
test('U05 fetch failure retries in place and empty results differ from withdrawn homes',async({page},info)=>{
 await page.route('**/api/v1/listings?**',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'TEMPORARY_FAILURE',message:'Discovery is temporarily unavailable'}})}));
 await page.goto('/bj/buy?beds=2');await expect(page.getByRole('alert').filter({hasText:'Discovery is temporarily unavailable'})).toBeVisible();await page.screenshot({path:`evidence/discovery-error-${info.project.name}.png`,fullPage:true});
 await page.unroute('**/api/v1/listings?**');await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.locator('.listing-card')).not.toHaveCount(0);await expect(page).toHaveURL(/beds=2/);await expect(page.getByRole('alert').filter({hasText:'Discovery is temporarily unavailable'})).toHaveCount(0);
 await page.goto('/bj/buy?text=unmatchable-ui-fixture');await expect(page.getByRole('heading',{name:'No matches just yet',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Clear filters',exact:true})).toBeVisible();
 await page.goto('/bj/commercial/workspace-100');await expect(page.getByRole('heading',{name:'This page is unavailable.',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'No matches just yet',exact:true})).toHaveCount(0);await page.screenshot({path:`evidence/withdrawn-home-${info.project.name}.png`,fullPage:true});
 await page.goto('/bj/communities/willow-park');await expect(page.getByRole('heading',{name:'Willow Park',exact:true})).toBeVisible();await page.screenshot({path:`evidence/community-detail-${info.project.name}.png`,fullPage:true});
});
