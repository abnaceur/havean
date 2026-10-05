import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {chromium} from '@playwright/test';
import {screenshotReady} from './screenshot-ready';
import {validateBaselines} from './visual-policy.mjs';
const original='evidence/visual/candidates',manifest=JSON.parse(fs.readFileSync(original+'/manifest.json','utf8')),folder='evidence/visual/proposals/d07';
validateBaselines(manifest,original);fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
if(browser.version()!==manifest.renderer)throw Error('Renderer must match the reviewed English baselines');
const screens:any[]=[];
try{for(const screen of manifest.screens.filter((x:any)=>x.id.startsWith('home-')||x.id.startsWith('city-'))){
 const context=await browser.newContext({viewport:screen.viewport,deviceScaleFactor:1,isMobile:false,hasTouch:false,locale:'en-GB',timezoneId:'Asia/Shanghai',reducedMotion:'reduce'}),page=await context.newPage();
 await page.goto('http://localhost:8088'+screen.route);await page.waitForLoadState('networkidle');await screenshotReady(page,true);await page.locator('[data-home-feed="rentals"]').waitFor();
 await page.evaluate(async()=>{const original=window.scrollY;for(let y=0;y<document.documentElement.scrollHeight;y+=window.innerHeight){window.scrollTo(0,y);await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));}window.scrollTo(0,original);await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));});await screenshotReady(page,true);

 if(screen.id.startsWith('city-')){await page.getByRole('button',{name:'Beijing',exact:true}).click();await page.getByLabel('Search cities',{exact:true}).fill('Beijing');}
 const bytes=await page.screenshot({path:folder+'/'+screen.file,fullPage:true,animations:'disabled',mask:[page.locator('.stats-updated')]});screens.push({...screen,sha256:createHash('sha256').update(bytes).digest('hex'),previousSha256:screen.sha256,approved:false,approvedBy:null,approvedAt:null,evidenceLabel:'P',change:'D07 adds ranking shortcuts and a rental recommendation feed; curated sections appear only for active eligible placements.'});await context.close();
 }
 const proposal={renderer:browser.version(),maxDiffPixelRatio:manifest.maxDiffPixelRatio,capturedAt:new Date().toISOString(),requiresHumanReview:true,screens};fs.writeFileSync(folder+'/manifest.json',JSON.stringify(proposal,null,2)+'\n');
 fs.writeFileSync(folder+'/index.html','<!doctype html><html lang="en"><meta charset="utf-8"><title>D07 English homepage changes</title><style>body{font:16px Arial;margin:24px;background:#f5f7f3;color:#202c29}section{margin-block:36px}figure{display:inline-block;vertical-align:top;margin:12px;width:min(45%,600px)}img{width:100%;border:1px solid #ddd}figcaption{padding:10px}h1{font-size:28px}</style><h1>D07 proposed English homepage updates</h1><p>Local synthetic inventory. Original website parity remains unverified. The approved files are preserved. Review the new ranking shortcuts and rental feed below the existing recommendation sections.</p>'+screens.map(s=>'<section><h2>'+s.id+'</h2><figure><figcaption>Previously approved</figcaption><img src="../../candidates/'+s.file+'" alt="Previously approved '+s.id+'"></figure><figure><figcaption>Proposed D07 update — pending review</figcaption><img src="'+s.file+'" alt="Proposed D07 '+s.id+'"></figure></section>').join('')+'</html>');console.log('Prepared '+screens.length+' pending English homepage updates; approved baselines preserved.');
}finally{await browser.close();}
