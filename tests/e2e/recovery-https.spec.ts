import '../support/env';
import {test,expect} from '@playwright/test';
import {login} from '../support/browser';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
test.skip(process.env.HAVEN_RECOVERY_DRILL!=='true','Requires isolated restored HTTPS application and pre-backup private asset');
test('Q09 restored identity, public listing and pre-backup private document work through real HTTPS',async({page,browser},info)=>{
 const ops=process.env.PUBLIC_OPS_URL!,web=process.env.PUBLIC_WEB_URL!,asset=process.env.RECOVERY_TEST_ASSET!;
 expect(asset).toMatch(/^[a-f0-9-]{36}$/);await page.goto(web+'/bj/buy/home-1');await expect(page.locator('#main')).toBeVisible();
 await login(page,'manager',ops,'/ops/management');const me=await page.request.get(ops+'/api/v1/me');expect(me.ok()).toBe(true);expect((await me.json()).data.roles).toContain('property_manager');
 const link=await page.request.post(ops+'/api/v1/documents/'+asset+'/download-link',{headers:{Origin:ops}});expect(link.ok()).toBe(true);const ticket=(await link.json()).data.url,document=await page.request.get(ops+ticket);expect(document.ok()).toBe(true);const bytes=await document.body();expect(createHash('sha256').update(bytes).digest('hex')).toBe(process.env.RECOVERY_TEST_ASSET_SHA256);
 const context=await browser.newContext({...info.project.use,baseURL:web});try{const buyer=await context.newPage();await login(buyer,'buyer',web,'/account');expect((await buyer.request.get(web+ticket)).status()).toBe(403);}finally{await context.close();}
 await page.screenshot({path:'evidence/q09-restored-'+info.project.name+'.png',scale:'css'});fs.writeFileSync('evidence/q09-restored-'+info.project.name+'.json',JSON.stringify({label:'P',protocol:'HTTPS',positiveMocked:false,preBackupAsset:asset,assetBytes:bytes.length,sha256Matched:true,restoredStaffMfa:true,foreignTicketStatus:403,publicListing:true},null,2)+'\n');
});
