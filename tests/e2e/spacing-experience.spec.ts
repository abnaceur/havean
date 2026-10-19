import '../support/env';
import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import {login} from '../support/browser';
const evidence='evidence/spacing-experience';
const crowding:{route:string;width:number;items:unknown[]}[]=[];
const baseline=process.env.HAVEN_SPACING_BASELINE==='true';
const ops=process.env.PUBLIC_OPS_URL||'http://localhost:8089';
const web=process.env.PUBLIC_WEB_URL||'http://localhost:8088';
async function ready(page:Page){await expect(page.locator('main h1')).toBeVisible({timeout:45000});await expect(page.locator('main .loading')).toHaveCount(0,{timeout:45000});await expect(page.locator('html')).toHaveAttribute('data-theme',/light|dark/);await page.evaluate(()=>document.fonts.ready);}
async function capture(page:Page,name:string){await page.screenshot({path:`${evidence}/${baseline?'before':'after'}-${name}.png`,scale:'css',animations:'disabled'});}
async function geometry(page:Page,route:string){
 const result=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,clipped:[...document.querySelectorAll('main h1,main h2,main input,main select,main .button')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.height&&(r.left< -1||r.right>innerWidth+1);}).map(el=>el.textContent?.slice(0,60))}));
 expect.soft(result.scroll,route+' document overflow').toBeLessThanOrEqual(result.width);
 expect.soft(result.clipped,route+' clipped content').toEqual([]);
 const items=await page.evaluate(()=>[...document.querySelectorAll('main h1,main h2,main h3,main h4')].flatMap(el=>{const next=el.nextElementSibling;if(next?.tagName!=='P'||!next.textContent?.trim())return [];const a=el.getBoundingClientRect(),b=next.getBoundingClientRect();if(!a.height||!b.height||b.top<a.top)return [];const gap=b.top-a.bottom;return gap<7.5?[{heading:el.textContent?.slice(0,90),parent:el.parentElement?.className,gap}]:[];}));
 if(items.length)crowding.push({route,width:page.viewportSize()!.width,items});
}
test('representative spacing before and after',async({page})=>{
 test.setTimeout(180000);fs.mkdirSync(evidence,{recursive:true});
 for(const [persona,origin,route,name] of [['',web,'/bj/buy','browse'],['',web,'/bj/tools/mortgage','mortgage'],['buyer',web,'/account','account'],['agent',ops,'/ops/listings','listings']]){
  if(persona)await login(page,persona,origin,route);else await page.goto(origin+route,{waitUntil:'domcontentloaded'});
  await ready(page);
  for(const width of [390,1440]){await page.setViewportSize({width,height:900});await capture(page,name+'-'+width);}
 }
});
test('public templates and authorized navigation share responsive spacing',async({page})=>{
 test.skip(baseline);test.setTimeout(900000);const visited:{persona:string;route:string;widths:number[]}[]=[];
 async function audit(route:string,persona='guest'){
  expect((await page.goto(route,{waitUntil:'domcontentloaded'}))?.status(),route).toBe(200);await ready(page);
  for(const width of [320,768,1440]){await page.setViewportSize({width,height:900});await geometry(page,route+' '+width);if(width!==768)await capture(page,new URL(route).pathname.replaceAll('/','-')+'-'+width);}
  visited.push({persona,route:new URL(route,web).pathname,widths:[320,768,1440]});
 }
 try{
  for(const route of ['/bj','/bj/search','/bj/map','/bj/rankings','/bj/tools/mortgage','/bj/list-property','/bj/support'])await audit(web+route);
  for(const category of ['buy','rent','new-homes','commercial','communities','agents','renovation']){
   await audit(web+'/bj/'+category);const link=page.locator('.card-title').first();await expect(link).toBeVisible();const href=await link.getAttribute('href');expect(href).toBeTruthy();await audit(new URL(href!,web).href);
  }
  for(const [persona,origin,entry,nav] of [['buyer',web,'/account','.account-tabs a'],['owner',web,'/account','.account-tabs a'],['tenant',web,'/tenant/leases','main nav a'],['manager',ops,'/ops/management','.workspace-sidebar nav a'],['admin',ops,'/ops','.workspace-sidebar nav a'],['agent',ops,'/ops/listings','.workspace-sidebar nav a'],['vendor',ops,'/ops/providers','.workspace-sidebar nav a']]){
   await login(page,persona,origin,entry);await ready(page);if(persona!=='tenant')await expect(page.locator(nav).first()).toBeVisible();
   const routes=await page.locator(nav).evaluateAll(els=>els.map(el=>(el as HTMLAnchorElement).href));
   await audit(origin+entry,persona);
   if(persona==='owner')await audit(web+'/bj/list-property',persona);
   if(persona==='buyer')await audit(web+'/bj/support',persona);
   for(const route of new Set([origin+entry,...routes]))if(!visited.some(v=>v.route===new URL(route).pathname))await audit(route,persona);
  }
 }finally{fs.writeFileSync(`${evidence}/crowding.json`,JSON.stringify(crowding,null,2));fs.writeFileSync(`${evidence}/routes.json`,JSON.stringify({evidenceLabel:'V',visited},null,2));}
 expect(visited.length).toBeGreaterThan(50);
});
test('spacing, accessible dialogs and action targets on compact screens',async({page})=>{
 test.skip(baseline);test.setTimeout(240000);
 for(const width of [320,375,390,768,1440]){
  await page.setViewportSize({width,height:844});await page.goto('/bj/buy',{waitUntil:'domcontentloaded'});await ready(page);
  await page.getByRole('button',{name:'All filters',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
  const fields=await dialog.locator('.field').evaluateAll(els=>els.map(el=>({gap:parseFloat(getComputedStyle(el).rowGap),height:el.querySelector('input,select')?.getBoundingClientRect().height})));
  expect(fields.length).toBeGreaterThan(0);expect(fields.every(f=>f.gap>=8&&(!f.height||f.height>=44))).toBe(true);
  for(const theme of ['light','dark']){
   await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   expect.soft((await new AxeBuilder({page}).analyze()).violations.filter(v=>['serious','critical'].includes(v.impact||'')),`filters ${width} ${theme}`).toEqual([]);
  }
  await geometry(page,'filters '+width);await capture(page,'filters-'+width);await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(page.getByRole('button',{name:'All filters',exact:true})).toBeFocused();
 }
 await page.goto('/bj/tools/mortgage',{waitUntil:'domcontentloaded'});await ready(page);
 const separation=await page.locator('.form-stack').evaluate(el=>{const fields=[...el.querySelectorAll(':scope > .field')];const last=fields.at(-1)!.getBoundingClientRect();const action=el.querySelector('button')!.getBoundingClientRect();return {fields:fields.slice(1).map((field,i)=>field.getBoundingClientRect().top-fields[i].getBoundingClientRect().bottom),action:action.top-last.bottom};});
 expect(separation.fields.every(gap=>gap>=24)).toBe(true);expect(separation.action).toBeGreaterThanOrEqual(24);
 await login(page,'agent',ops,'/ops/listings');await ready(page);
 for(const width of [320,390,1440]){
  await page.setViewportSize({width,height:900});
  const targets=await page.locator('main .row-actions .button:visible').evaluateAll(els=>els.map(el=>({text:el.textContent,height:el.getBoundingClientRect().height})));
  expect(targets.length).toBeGreaterThan(0);expect.soft(targets.filter(t=>t.height<44),'workspace touch targets').toEqual([]);
  expect.soft((await new AxeBuilder({page}).analyze()).violations.filter(v=>['serious','critical'].includes(v.impact||'')),'workspace accessibility '+width).toEqual([]);
 }
});

test('sign-in, registration and recovery retain comfortable form spacing',async({page})=>{
 test.skip(baseline);test.setTimeout(180000);
 for(const width of [320,768,1440]){
  await page.setViewportSize({width,height:900});await page.goto('/api/v1/auth/login?prompt=login&returnTo=%2Faccount');
  for(const screen of ['login','register','recovery']){
   if(screen==='register')await page.getByRole('link',{name:'Register',exact:true}).click();
   if(screen==='recovery'){await page.getByRole('link',{name:/Back to Login/i}).click();await page.getByRole('link',{name:'Forgot Password?'}).click();}
   await expect(page.locator('main form')).toBeVisible();await page.evaluate(()=>document.fonts.ready);
   await geometry(page,screen+' '+width);
   expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations.filter(v=>['serious','critical'].includes(v.impact||''))).toEqual([]);
   await capture(page,screen+'-'+width);
  }
 }
});

test('account forms and all management views preserve section and action spacing',async({page})=>{
 test.skip(baseline);test.setTimeout(300000);
 await login(page,'owner',web,'/account/profile');await ready(page);
 for(const width of [320,390,1440]){
  await page.setViewportSize({width,height:900});
  const gap=await page.locator('.account-profile h3').evaluate(el=>el.getBoundingClientRect().top-el.previousElementSibling!.getBoundingClientRect().bottom);
  expect(gap).toBeGreaterThanOrEqual(32);await capture(page,'profile-final-'+width);
 }
 for(const route of ['/bj/list-property','/bj/support']){
  await page.goto(route,{waitUntil:'domcontentloaded'});await ready(page);
  for(const width of [320,768,1440]){await page.setViewportSize({width,height:900});await geometry(page,'owner '+route+' '+width);await capture(page,'owner-'+route.split('/').at(-1)+'-'+width);}
 }
 await login(page,'manager',ops,'/ops/management');await ready(page);
 const tabs=await page.locator('.management-tabs button').allTextContents();expect(tabs).toHaveLength(7);
 for(const tab of tabs){
  await page.locator('.management-tabs').getByRole('button',{name:tab,exact:true}).click();await expect(page.locator('.section-heading h2').first()).toHaveText(tab);await ready(page);
  for(const width of [320,768,1440]){await page.setViewportSize({width,height:900});await geometry(page,'management '+tab+' '+width);if(width!==768)await capture(page,'management-'+tab+'-'+width);}
 }
 await page.locator('.management-tabs').getByRole('button',{name:'Leases',exact:true}).click();await ready(page);
 await page.getByRole('button',{name:'New lease',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
 for(const width of [320,1440]){
  await page.setViewportSize({width,height:900});await geometry(page,'lease draft '+width);
  for(const theme of ['light','dark']){await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);expect((await new AxeBuilder({page}).analyze()).violations.filter(v=>['serious','critical'].includes(v.impact||''))).toEqual([]);}
  await capture(page,'lease-form-'+width);
 }
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(page.getByRole('button',{name:'New lease',exact:true})).toBeFocused();
 fs.writeFileSync(`${evidence}/management-views.json`,JSON.stringify({evidenceLabel:'V',tabs,widths:[320,768,1440]},null,2));
});

test('home callout and development heading separate their supporting copy',async({page})=>{
 test.skip(baseline);test.setTimeout(120000);
 await page.goto('/bj/new-homes',{waitUntil:'domcontentloaded'});await ready(page);
 const detail=await page.locator('.card-title').first().getAttribute('href');expect(detail).toBeTruthy();
 for(const route of ['/bj',detail!]){
  await page.goto(route,{waitUntil:'domcontentloaded'});await ready(page);
  const heading=page.locator(route==='/bj'?'.owner-banner h2':'.detail-main > h1');
  for(const width of [320,768,1440]){
   await page.setViewportSize({width,height:900});
   const gap=await heading.evaluate(el=>el.nextElementSibling!.getBoundingClientRect().top-el.getBoundingClientRect().bottom);expect(gap).toBeGreaterThanOrEqual(12);
   await geometry(page,route+' final '+width);await heading.scrollIntoViewIfNeeded();await capture(page,(route==='/bj'?'home-callout':'development-heading')+'-'+width);
  }
 }
});
