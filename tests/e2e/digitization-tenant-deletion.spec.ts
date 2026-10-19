import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import {login} from '../support/browser';
test('platform administrator explicitly erases a fresh tenant engine scope through server sessions and retains its tombstone after reload',async({page,browser},info)=>{
 const origin='http://localhost:8089',fixture=JSON.parse(readFileSync('infra/generated/integration/tenant-deletion-browser.json','utf8')).find((row:any)=>row.project===info.project.name);
 await login(page,'admin',origin,'/ops/admin');const panel=page.getByRole('region',{name:'Tenant digitization deletion',exact:true});
 await panel.getByLabel('Organization for engine deletion').selectOption(fixture.organizationId);await expect(panel).toContainText('1 workspaces');
 const submit=panel.getByRole('button',{name:'Delete tenant engine data',exact:true});await expect(submit).toBeDisabled();await panel.getByLabel('Tenant deletion reason').fill('Explicitly erase the synthetic browser tenant engine scope');await expect(submit).toBeDisabled();await panel.getByRole('checkbox').check();await expect(submit).toBeEnabled();
 const accessibility=await new AxeBuilder({page}).include('section[aria-label="Tenant digitization deletion"]').analyze();expect(accessibility.violations.filter(v=>['critical','serious'].includes(v.impact||''))).toEqual([]);
 await submit.click();await expect(panel).toContainText('Engine access is permanently revoked.');await expect(panel).toContainText('Online cleanup jobs have completed.');await expect(submit).toHaveCount(0);
 const response=await page.request.get(`${origin}/api/v1/ops/organizations/${fixture.organizationId}/digitization-deletion`);expect(response.status()).toBe(200);expect((await response.json()).data.request).toMatchObject({pendingJobs:0,retainedOriginals:0});
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});expect(await panel.evaluate(node=>node.scrollWidth<=node.clientWidth+1)).toBe(true);}
 await panel.screenshot({path:`evidence/digitization/tenant-engine-deletion-${info.project.name}.png`});await page.reload();await panel.getByLabel('Organization for engine deletion').selectOption(fixture.organizationId);await expect(panel).toContainText('Engine access is permanently revoked.');
 const anonymous=await browser.newContext();try{expect((await anonymous.request.get(`${origin}/api/v1/ops/organizations/${fixture.organizationId}/digitization-deletion`)).status()).toBe(401);}finally{await anonymous.close();}
});
