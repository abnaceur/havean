import {test,expect} from '@playwright/test';
import {login} from '../support/browser';

test('private example shows one access message for another account and source results for its creator',async({page,browser})=>{
 const workspace=process.env.DIGITIZATION_EXAMPLE_WORKSPACE;
 test.skip(!workspace,'Requires an explicitly selected retained authored example; creates or publishes nothing.');
 const origin=process.env.PUBLIC_OPS_URL||'http://localhost:8089',route='/ops/digitization?workspace='+workspace,api='/api/v1/ops/digitizations/'+workspace;
 await login(page,'admin',origin,'/ops');
 const requests:string[]=[];
 page.on('request',request=>{const path=new URL(request.url()).pathname;if(path.startsWith(api))requests.push(path);});
 await page.goto(origin+route);
 const access=page.getByRole('region',{name:'Workspace access',exact:true});
 await expect(access.getByRole('heading',{name:'Workspace unavailable for this account'})).toBeVisible();
 await expect(access.getByText('Private intake drafts are accessible only to their creator.',{exact:false})).toBeVisible();
 await expect(access.getByRole('link',{name:'View my private drafts'})).toHaveAttribute('href','/ops/digitization');
 await expect(page.getByRole('region',{name:'Private document fact review'})).toHaveCount(0);
 await expect(page.getByText('Digitization workspace not found',{exact:true})).toHaveCount(0);
 expect(requests.length).toBeGreaterThan(0);expect(requests.every(path=>path===api)).toBe(true);
 const context=await browser.newContext();
 try{
  const agent=await context.newPage();await login(agent,'agent',origin,'/ops');await agent.goto(origin+route);
  const facts=agent.getByRole('region',{name:'Private document fact review'});
  await expect(facts.getByLabel('Source fact',{exact:true})).toBeVisible();
  const select=facts.getByLabel('Source fact',{exact:true});
  const candidate=await select.locator('option').nth(1).getAttribute('value');expect(candidate).toBeTruthy();
  await select.selectOption(candidate!);
  await expect(facts.getByText('Recorded value:',{exact:false})).toBeVisible();
  const crop=facts.getByRole('img',{name:/Source crop for/});await expect(crop).toBeVisible();
  const source=await crop.locator('image').getAttribute('href');expect(source).toBeTruthy();
  expect((await agent.request.get(origin+source)).status()).toBe(200);
  await expect(agent.getByRole('region',{name:'Workspace access',exact:true})).toHaveCount(0);
  await facts.screenshot({path:'evidence/digitization/example-agent-document-results.png'});
 }finally{await context.close();}
});
