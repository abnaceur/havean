import fs from 'node:fs';
import {test,expect} from '@playwright/test';
import {login,apiRequest} from '../support/browser';
test('agent loads saved property objects and invalid or stale object edits preserve the saved revision',async({page})=>{
 test.skip(process.env.CHECK_FURNISHED_DEMO!=='true','Uses the retained local furnished example.');test.setTimeout(120000);
 const prior=JSON.parse(fs.readFileSync('infra/generated/digitization-agent-actions.json','utf8')),path=`/ops/digitizations/${prior.engineId}/geometry`;
 await login(page,'agent','http://localhost:8089','/ops');
 const read=async()=>{const response=await page.request.get('http://localhost:8089/api/v1'+path);expect(response.ok()).toBe(true);return (await response.json()).data;},before=await read();expect(before.geometry.furnishings).toHaveLength(46);
 await page.goto(`http://localhost:8089/ops/digitization?workspace=${prior.engineId}`);const editor=page.getByRole('region',{name:'Property furnishings',exact:true});await expect(editor).toBeVisible({timeout:30000});await expect(editor.getByText('46 objects in this draft',{exact:true})).toBeVisible();
 await editor.getByLabel('Object to edit',{exact:true}).selectOption('object-2');await expect(editor.getByLabel('Object label',{exact:true})).toHaveValue('Linen three-seat sofa');await editor.getByLabel('Object height (metres)',{exact:true}).fill('9');await editor.getByRole('button',{name:'Update object',exact:true}).click();
 await editor.getByLabel('Object source note',{exact:true}).fill('Functional rejection check: intentionally invalid object height.');await editor.getByRole('checkbox').check();const rejected=page.waitForResponse(r=>r.url().endsWith('/geometry/furnishings')&&r.request().method()==='POST');await editor.getByRole('button',{name:'Save property furnishings',exact:true}).click();expect((await rejected).status()).toBe(422);await expect(editor.getByRole('alert')).toContainText('ceiling');expect((await read()).geometry.id).toBe(before.geometry.id);
 const stale=await apiRequest(page,path+'/furnishings',{version:before.workspaceVersion-1,geometryRevisionId:before.geometry.id,note:'Stale author input functional check.',suppliedObjectsConfirmed:true,furnishings:[]});expect(stale.status()).toBe(409);expect((await read()).geometry.furnishings).toHaveLength(46);
 await page.reload();await editor.getByLabel('Object to edit',{exact:true}).selectOption('object-2');await expect(editor.getByLabel('Object height (metres)',{exact:true})).toHaveValue('0.9');
});
