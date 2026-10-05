import '../support/env';
import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {createRequire} from 'node:module';
import {rebuildSearch} from '../../apps/worker/src/search-rebuild';
import {searchTask} from '../../apps/worker/src/processor';
import {login} from '../support/browser';
const require=createRequire(new URL('../../packages/database/package.json',import.meta.url)),{Pool}=require('pg'),fixtures=new Pool({connectionString:process.env.DATABASE_URL});
test.afterAll(()=>fixtures.end());
const query='city=bj&transaction=sale&segment=residential&sort=newest',route='/bj/buy?sort=newest';
async function expected(){return (await fixtures.query(`SELECT id FROM public_listings WHERE city='bj' AND transaction='sale' AND segment='residential' ORDER BY "publishedAt" DESC NULLS LAST,id LIMIT 20`)).rows.map(x=>x.id);}
async function cards(page:any){return page.locator('.listing-card').evaluateAll((rows:HTMLElement[])=>rows.map(row=>row.dataset.listingId));}
test('D10 browsing remains available while a complete verified replacement index is built and swapped',async({page})=>{
 test.setTimeout(120000);await rebuildSearch({database:fixtures});const ids=await expected();await page.goto(route);await expect.poll(()=>cards(page)).toEqual(ids);
 const result=await rebuildSearch({database:fixtures,afterPopulate:async()=>{await page.reload();await expect.poll(()=>cards(page)).toEqual(ids);const response=await page.request.get('/api/v1/listings?'+query);expect(response.status()).toBe(200);expect((await response.json()).meta.total).toBeGreaterThan(0);}});
 expect(result.sourceCount).toBe(result.verifiedCount);await page.reload();await expect.poll(()=>cards(page)).toEqual(ids);const response=await page.request.get('/api/v1/listings?'+query);expect((await response.json()).meta.searchMode).toBe('meilisearch');
});
test('D10 actual missing search index has an explicit nonempty SQL fallback, private admin metrics and successful rebuild recovery',async({page},info)=>{
 test.setTimeout(120000);const ids=await expected();
 try{
  await searchTask('/indexes/listings','DELETE');await page.goto(route);await expect.poll(()=>cards(page)).toEqual(ids);await expect(page.getByRole('status').filter({hasText:'Showing current properties while search recovers.'})).toBeVisible();
  const response=await page.request.get('/api/v1/listings?'+query);expect(response.status()).toBe(200);const body=await response.json();expect(body.meta).toMatchObject({searchMode:'sql',degraded:true,degradedReason:'search-unavailable'});expect(body.data.map(x=>x.id)).toEqual(ids);expect(body.meta.total).toBeGreaterThan(0);
  expect((await page.request.get('/api/v1/health/metrics')).status()).toBe(401);
  const accessibility=await new AxeBuilder({page}).include('main').analyze();expect(accessibility.violations.filter(issue=>issue.impact==='serious'||issue.impact==='critical')).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:`evidence/d10-search-recovery-${info.project.name}.png`,scale:'css'});
  await login(page,'admin','http://localhost:8089','/ops');const metrics=await page.request.get('http://localhost:8089/api/v1/health/metrics');expect(metrics.status()).toBe(200);expect((await metrics.json()).data.search).toMatchObject({providerAvailable:false,indexedDocuments:null});
 }finally{await rebuildSearch({database:fixtures});}
 await page.goto(route);await expect.poll(()=>cards(page)).toEqual(ids);await expect(page.getByRole('status').filter({hasText:'Showing current properties while search recovers.'})).toHaveCount(0);const recovered=await page.request.get('/api/v1/listings?'+query);expect((await recovered.json()).meta).toMatchObject({searchMode:'meilisearch',degraded:false});
});
