import '../support/env';
import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {login} from '../support/browser';
import {screenshotReady} from '../../scripts/screenshot-ready';

const viewports=[{width:320,height:740},{width:375,height:812},{width:390,height:844},{width:550,height:800},{width:768,height:1024},{width:800,height:900},{width:1024,height:768},{width:1440,height:900},{width:1920,height:1080},{width:844,height:390}];
async function checkLayout(page:import('@playwright/test').Page,description:string){
 const geometry=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,outliers:[...document.querySelectorAll('header a,header button,main h1,main h2,main input,main select,main .button')].filter(element=>{const rect=element.getBoundingClientRect();return rect.width&&rect.height&&(rect.right>innerWidth+1||rect.left< -1);}).map(element=>({text:element.textContent?.slice(0,80),className:element.className}))}));
 expect.soft(geometry.scrollWidth,description+' document overflow').toBeLessThanOrEqual(geometry.width);
 expect.soft(geometry.outliers,description+' clipped controls/headings').toEqual([]);
}
test('Haven public pages adapt to phone, tablet, desktop and landscape viewports',async({page},info)=>{
 test.setTimeout(360000);
 const routes=['/bj','/bj/buy','/bj/rent','/bj/new-homes','/bj/commercial','/bj/communities','/bj/agents','/bj/renovation','/bj/tools/mortgage','/bj/support'];
 await page.goto('/bj/buy');const detail=await page.locator('.card-title').first().getAttribute('href');expect(detail).toBeTruthy();routes.push(detail!);
 for(const route of routes){
   expect((await page.goto(route))?.status(),route).toBe(200);
   await expect(page.locator('main h1')).toBeVisible();await page.evaluate(()=>document.fonts.ready);
  for(const viewport of viewports){
   await page.setViewportSize(viewport);
   await checkLayout(page,route+' '+viewport.width+'x'+viewport.height);
   if(route==='/bj'){await expect(page.locator('.haven-hero')).toHaveCount(1);await screenshotReady(page);await page.screenshot({path:info.outputPath('home-'+viewport.width+'x'+viewport.height+'.png'),animations:'disabled'});}
  }
 }
});
test('Haven filters, city selector and themes stay usable on small and short screens',async({page},info)=>{
 test.setTimeout(180000);
 for(const viewport of [viewports[0],viewports[2],viewports[4],viewports[7],viewports[9]]){
  await page.setViewportSize(viewport);await page.goto('/bj/buy');await expect(page.locator('.listing-card').first()).toBeVisible();
  for(const theme of ['dark','light']){
   await page.getByRole('button',{name:'Switch to '+theme+' theme'}).click();await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
   await page.getByRole('button',{name:'All filters',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
   await checkLayout(page,'filters '+theme+' '+viewport.width);const box=await dialog.boundingBox();expect(box!.height).toBeLessThanOrEqual(viewport.height-16);
   const axe=await new AxeBuilder({page}).analyze();expect.soft(axe.violations.filter(v=>['serious','critical'].includes(v.impact||'')),theme+' filter accessibility '+viewport.width).toEqual([]);
   await page.screenshot({path:info.outputPath('filters-'+theme+'-'+viewport.width+'.png'),fullPage:true});
   await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(page.getByRole('button',{name:'All filters',exact:true})).toBeFocused();
  }
  await page.locator('.city-control').click();await expect(page.getByRole('dialog')).toBeVisible();await checkLayout(page,'city '+viewport.width);await page.keyboard.press('Escape');
  if(viewport.width<=1050){await page.getByRole('button',{name:'Open menu'}).click();await expect(page.getByRole('dialog',{name:'Explore Haven'})).toBeVisible();await expect(page.getByRole('dialog').getByRole('link',{name:'Rent a home'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Open menu'})).toBeFocused();}
 }
});
test('Haven signed-in account and professional workspace adapt to every viewport',async({page},info)=>{
 test.setTimeout(240000);const ops=process.env.PUBLIC_OPS_URL||'http://localhost:8089';
 await login(page,'buyer');
 await expect(page.locator('main h1')).toBeVisible();
 for(const viewport of viewports){await page.setViewportSize(viewport);await checkLayout(page,'account '+viewport.width);}
 await page.getByRole('button',{name:'Switch to dark theme'}).click();await checkLayout(page,'dark account');expect((await new AxeBuilder({page}).analyze()).violations.filter(v=>['serious','critical'].includes(v.impact||''))).toEqual([]);await page.getByRole('button',{name:'Switch to light theme'}).click();
 await login(page,'admin',ops,'/ops');
 await expect(page.locator('.workspace-title h1')).toBeVisible();
 for(const viewport of viewports){await page.setViewportSize(viewport);await checkLayout(page,'workspace '+viewport.width);if([320,768,1440].includes(viewport.width))await page.screenshot({path:info.outputPath('workspace-'+viewport.width+'.png'),fullPage:true});}
 await page.getByRole('button',{name:'Switch to dark theme'}).click();await checkLayout(page,'dark workspace');expect((await new AxeBuilder({page}).analyze()).violations.filter(v=>['serious','critical'].includes(v.impact||''))).toEqual([]);
});

test('Haven category details and authorized navigation destinations retain responsive content',async({page})=>{
 test.setTimeout(360000);const widths=[320,768,1440],visited:string[]=[];
 for(const category of ['rent','new-homes','commercial','communities','agents','renovation']){
  await page.goto('/bj/'+category);const link=page.locator('.card-title').first();await expect(link).toBeVisible();const route=await link.getAttribute('href');expect(route).toBeTruthy();
  expect((await page.goto(route!))?.status()).toBe(200);await expect(page.locator('main h1')).toBeVisible();visited.push(route!);
  for(const width of widths){await page.setViewportSize({width,height:900});await checkLayout(page,route+' '+width);}
 }
 const ops=process.env.PUBLIC_OPS_URL||'http://localhost:8089';
 for(const [persona,origin,entry,nav] of [['buyer',process.env.PUBLIC_WEB_URL||'http://localhost:8088','/account','.account-tabs a'],['admin',ops,'/ops','.workspace-sidebar nav a']]){
  await login(page,persona,origin,entry);await expect(page.locator(nav).first()).toBeVisible();const routes=await page.locator(nav).evaluateAll(elements=>elements.map(element=>(element as HTMLAnchorElement).href));
  expect(routes.length).toBeGreaterThan(3);
  for(const route of routes){expect((await page.goto(route))?.status()).toBe(200);await expect(page.locator('main h1')).toBeVisible();await expect(page.locator('main .loading')).toHaveCount(0);visited.push(new URL(route).pathname);for(const width of widths){await page.setViewportSize({width,height:900});await checkLayout(page,route+' '+width);}}
 }
 console.log(JSON.stringify({evidenceLabel:'P',referenceParity:'unverified',widths,visited}));
});
