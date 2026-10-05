import {test,expect} from '@playwright/test';
import {login,apiRequest} from '../support/browser';
test('G03 city selection preserves category, clears incompatible filters and survives refresh',async({page})=>{
 await page.goto('/bj/buy?district=Chaoyang&beds=2');
 await page.getByRole('button',{name:'Beijing',exact:true}).click();
 await page.getByLabel('Search cities',{exact:true}).fill('Shanghai');
 await page.getByRole('button',{name:/Shanghai CNY/}).click();
 await expect(page).toHaveURL(/\/sh\/buy$/);
 await expect(page.getByRole('button',{name:'Shanghai',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'No matches just yet',exact:true})).toBeVisible();
 await page.reload();await expect(page.getByRole('button',{name:'Shanghai',exact:true})).toBeVisible();
 await page.goto('/');await expect(page).toHaveURL(/\/sh$/);
 await page.goto('/unconfigured-city/buy?district=Chaoyang');await expect(page.getByRole('heading',{name:'This page is unavailable.',exact:true})).toBeVisible();
 await page.getByRole('link',{name:'Explore available homes',exact:true}).click();await expect(page).toHaveURL(/\/bj\/buy$/);expect(page.url()).not.toContain('district=');
});
test('G04 community search, city/district filtering and empty reset',async({page})=>{
 await page.goto('/bj/communities');await page.getByRole('textbox',{name:'Search properties',exact:true}).fill('Willow');await page.getByRole('button',{name:'Search',exact:true}).click();await expect(page).toHaveURL(/\/bj\/communities\?text=Willow/);
 await expect(page.getByRole('link',{name:'Willow Park',exact:true})).toBeVisible();await page.getByRole('link',{name:'Willow Park',exact:true}).click();await expect(page.getByRole('heading',{name:'Willow Park',exact:true})).toBeVisible();await page.goBack();await expect(page).toHaveURL(/text=Willow/);
 const response=await page.request.get('/api/v1/communities?city=sh&text=Willow');expect(response.status()).toBe(200);expect((await response.json()).data).toHaveLength(0);
 const scoped=await page.request.get('/api/v1/communities?city=bj&districtId=10000000-0000-4000-8000-000000000020&limit=1');const body=await scoped.json();expect(body.meta.total).toBeGreaterThanOrEqual(1);expect(body.data.every((row:any)=>row.districtId==='10000000-0000-4000-8000-000000000020')).toBe(true);
 await page.getByRole('textbox',{name:'Search properties',exact:true}).fill('No matching community fixture');await page.getByRole('button',{name:'Search',exact:true}).click();await expect(page.getByRole('heading',{name:'No matches just yet',exact:true})).toBeVisible();await page.getByRole('link',{name:'Clear filters',exact:true}).click();await expect(page.getByRole('link',{name:'Willow Park',exact:true})).toBeVisible();
});

test('G05 community tabs and dated statistics reconcile to eligible public records',async({page},info)=>{
 await page.goto('/bj/communities/willow-park');await expect(page.getByRole('heading',{name:'Willow Park',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Buildings',exact:true})).toBeVisible();
 const stats=(await (await page.request.get('/api/v1/communities/willow-park/statistics')).json()).data;
 const sale=(await (await page.request.get('/api/v1/communities/willow-park/listings?transaction=sale')).json());expect(stats.sale.count).toBe(sale.meta.total);expect(sale.data.every((row:any)=>row.transaction==='sale'&&row.segment==='residential')).toBe(true);expect(typeof stats.sale.medianPrice).toBe('string');expect(stats.definition).toContain('asking');expect(Date.parse(stats.asOf)).toBeGreaterThan(0);
 const cards=page.locator('.detail-section').filter({has:page.getByRole('heading',{name:'Homes in this community',exact:true})});await expect(cards.locator('.listing-card')).toHaveCount(sale.data.length);
 await page.getByRole('button',{name:'To rent',exact:true}).click();const rent=(await (await page.request.get('/api/v1/communities/willow-park/listings?transaction=rent')).json());expect(stats.rent.count).toBe(rent.meta.total);await expect(cards.locator('.listing-card')).toHaveCount(rent.data.length);expect(await cards.innerText()).not.toContain('FOR SALE');
 expect(JSON.stringify({stats,sale: sale.data,rent:rent.data})).not.toMatch(/PRIVATE_FIXTURE|private_address|tenant_id|owner_id|organization_id/);
 await login(page,'admin','http://localhost:8089','/ops/geography');const suffix=info.project.name+'-'+crypto.randomUUID().slice(0,8);const response=await apiRequest(page,'/ops/geography/communities',{kind:'communities',name:'Empty community '+suffix,slug:'empty-community-'+suffix,districtId:'10000000-0000-4000-8000-000000000020',address:'Approximate synthetic community location',latitude:39.9,longitude:116.4});expect(response.status()).toBe(201);const record=(await response.json()).data;
 await page.goto('http://localhost:8088/bj/communities/'+record.slug);await expect(page.getByRole('heading',{name:'No homes for sale',exact:true})).toBeVisible();await expect(page.getByText('Typical asking price: Unavailable',{exact:true})).toBeVisible();
});

test('G04 community pagination changes records and preserves district scope',async({page})=>{
 await page.goto('/bj/communities?districtId=10000000-0000-4000-8000-000000000020&limit=1');await expect(page.locator('.directory-card')).toHaveCount(1);const first=await page.locator('.directory-card .card-title').getAttribute('href');await page.getByRole('link',{name:'Next',exact:true}).click();await expect(page).toHaveURL(/page=2/);await expect(page.locator('.directory-card')).toHaveCount(1);expect(await page.locator('.directory-card .card-title').getAttribute('href')).not.toBe(first);await expect(page.getByLabel('Community district',{exact:true})).toHaveValue('10000000-0000-4000-8000-000000000020');
});
