import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs';
import {validateBaselines} from '../../scripts/visual-policy.mjs';
import {screenshotReady} from '../../scripts/screenshot-ready';
const folder='evidence/visual/candidates',manifest=JSON.parse(fs.readFileSync(folder+'/manifest.json','utf8'));
// Approved detail baselines include the map-provider-unavailable state.
// Abort only that optional external provider; API/identity/storage remain native.
test.beforeEach(async({page},info)=>{
 if(!info.title.includes('baseline detail-'))return;
 await page.route('https://tiles.example.test/**',route=>route.abort('failed'));
 await page.route('**/api/v1/map/config',async route=>{const response=await route.fetch();expect(response.ok()).toBe(true);const body=await response.json();await route.fulfill({response,json:{...body,data:{...body.data,style:'https://tiles.example.test/unavailable-style.json'}}});});
});
test.beforeAll(async({browser},info)=>{expect(info.config.updateSnapshots).toBe('none');expect(browser.version()).toBe(manifest.renderer);expect(validateBaselines(manifest,folder)).toBe(33);});
async function open(page:Page,screen:any){await page.setViewportSize(screen.viewport);await page.goto((process.env.PUBLIC_WEB_URL||'http://localhost:8088')+screen.route);await page.waitForLoadState('networkidle');await expect(page.locator('.loading')).toHaveCount(0);await screenshotReady(page,screen.route==='/bj');if(screen.id.startsWith('detail-')){await expect(page.getByRole('heading',{name:'More places to call home',exact:true})).toBeVisible();await expect(page.getByText('Olivia Chen',{exact:true})).toBeVisible();await expect(page.locator('.map-failure')).toBeVisible();await screenshotReady(page);}if(screen.id.startsWith('filters-'))await page.getByRole('button',{name:'All filters',exact:true}).click();if(screen.id.startsWith('city-')){await page.getByRole('button',{name:'Beijing',exact:true}).click();await page.getByLabel('Search cities',{exact:true}).fill('Beijing');}}
async function shot(page:Page){return page.screenshot({fullPage:true,animations:'disabled',mask:[page.locator('.stats-updated')]});}
for(const screen of manifest.screens)test('U06 approved English baseline '+screen.id,async({page})=>{await open(page,screen);expect(await shot(page)).toMatchSnapshot(screen.file,{maxDiffPixelRatio:manifest.maxDiffPixelRatio});});
test('U06 deliberate screenshot layout shift exceeds the approved pixel gate',async({page})=>{
 const screen=manifest.screens.find((row:any)=>row.id==='home-390');await open(page,screen);expect(await shot(page)).toMatchSnapshot(screen.file,{maxDiffPixelRatio:manifest.maxDiffPixelRatio});
 await page.addStyleTag({content:'.hero{transform:translateY(40px)!important;transition:none!important}'});const shifted=await shot(page),baseline=fs.readFileSync(folder+'/'+screen.file);
 const ratio=await page.evaluate(async({first,second})=>{
  async function pixels(base64:string){const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const context=canvas.getContext('2d')!;context.drawImage(image,0,0);return {width:image.width,height:image.height,data:context.getImageData(0,0,image.width,image.height).data};}
  const a=await pixels(first),b=await pixels(second);if(a.width!==b.width||a.height!==b.height)return 1;let changed=0;for(let index=0;index<a.data.length;index+=4)if(Math.max(Math.abs(a.data[index]-b.data[index]),Math.abs(a.data[index+1]-b.data[index+1]),Math.abs(a.data[index+2]-b.data[index+2]))>24)changed++;return changed/(a.width*a.height);
 },{first:baseline.toString('base64'),second:shifted.toString('base64')});
 expect(ratio).toBeGreaterThan(manifest.maxDiffPixelRatio);fs.writeFileSync('evidence/visual/layout-shift-pixel-result.json',JSON.stringify({ratio,maximum:manifest.maxDiffPixelRatio,rejected:ratio>manifest.maxDiffPixelRatio})+'\n');
});
