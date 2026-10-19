import '../support/env';
import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('Haven design keeps live inventory, responsive layout, search filters and persistent theme',async({page},info)=>{
 await page.goto('/bj');
 await expect(page.getByRole('heading',{name:'See more. Live better.'})).toBeVisible();
 await expect(page.locator('[data-home-feed="resale"] .listing-card').first()).toBeVisible();
 await expect(page.locator('.haven-hero-tour')).toHaveAttribute('href','/bj/buy?tourAvailable=true');
 await expect(page.getByRole('link',{name:'Explore homes with tours'})).toHaveAttribute('href','/bj/buy?tourAvailable=true');
 const live=await page.request.get('/api/v1/discovery/home?city=bj');expect(live.ok()).toBe(true);
 const ids=(await live.json()).data.resale.map((r:{id:string})=>r.id);
 expect(await page.locator('[data-home-feed="resale"] .listing-card').evaluateAll(elements=>elements.map(e=>e.getAttribute('data-listing-id')))).toEqual(ids);
 await page.evaluate(()=>document.fonts.ready);
 expect(await page.locator('h1').evaluate(e=>getComputedStyle(e).fontFamily)).toContain('Space Grotesk');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 let axe=await new AxeBuilder({page}).analyze();expect(axe.violations.filter(v=>['serious','critical'].includes(v.impact||''))).toEqual([]);
 await page.screenshot({path:info.outputPath('home-light.png'),fullPage:true});
 await page.getByRole('button',{name:'Switch to dark theme'}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 axe=await new AxeBuilder({page}).analyze();expect(axe.violations.filter(v=>['serious','critical'].includes(v.impact||''))).toEqual([]);
 await page.screenshot({path:info.outputPath('home-dark.png'),fullPage:true});
 await page.getByRole('button',{name:'Switch to light theme'}).click();
 const form=page.getByRole('region',{name:'Find a home'});
 await form.getByRole('button',{name:'Rent',exact:true}).click();await form.getByLabel('Building type').selectOption('Tower');await form.getByLabel('Bedrooms',{exact:true}).selectOption('2');
 await form.getByRole('button',{name:'Find my place'}).click();await expect(page).toHaveURL(/\/bj\/rent\?/);const url=new URL(page.url());expect(url.searchParams.get('beds')).toBe('2');expect(url.searchParams.get('buildingType')).toBe('Tower');await expect(page.locator('main')).not.toContainText('We couldn’t load this');
 await page.goto('/bj');await page.getByRole('region',{name:'Find a home'}).getByRole('button',{name:'New homes',exact:true}).click();await page.getByLabel('Bedrooms',{exact:true}).selectOption('3');await page.getByRole('button',{name:'Find my place'}).click();await expect(page).toHaveURL('/bj/new-homes?beds=3');
});

test('Haven home retains API location suggestions and opens real property details',async({page},info)=>{
 await page.goto('/bj');const card=page.locator('[data-home-feed="resale"] .listing-card').first();await expect(card).toBeVisible();const target=await card.locator('.card-title').getAttribute('href');await card.locator('.card-title').click();await expect(page).toHaveURL(target!);await expect(page.locator('main h1')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('property-detail.png'),fullPage:true});
 await page.goto('/bj');const search=page.getByRole('combobox',{name:'Search homes, neighborhoods or communities'});await search.fill('Chaoyang');const option=page.getByRole('option',{name:/Chaoyang.*district/i}).first();await expect(option).toBeVisible();await option.click();await expect(page).toHaveURL(/\/bj\/buy\?districtId=/);await expect(page.locator('main h1')).toBeVisible();
});
