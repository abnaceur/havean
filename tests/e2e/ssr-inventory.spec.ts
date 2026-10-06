import '../support/env';
import {test,expect} from '@playwright/test';
test('Q07 filtered public inventory is meaningful before JavaScript and matches current native API criteria',async({browser,request},info)=>{
 const web=process.env.PUBLIC_WEB_URL||'http://localhost:8088',criteria='city=bj&transaction=sale&segment=residential&sort=price_asc&maxPrice=200',native=await request.get(web+'/api/v1/listings?'+criteria);expect(native.ok()).toBe(true);const ids=(await native.json()).data.map((row:any)=>row.id);expect(ids.length).toBeGreaterThan(0);
 const context=await browser.newContext({...info.project.use,javaScriptEnabled:false}),page=await context.newPage();try{const response=await page.goto(web+'/bj/buy?sort=price_asc&maxPrice=200');expect(response?.ok()).toBe(true);expect(await page.locator('.listing-card').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-listing-id')))).toEqual(ids);await expect(page.locator('.spinner')).toHaveCount(0);}finally{await context.close();}
});
