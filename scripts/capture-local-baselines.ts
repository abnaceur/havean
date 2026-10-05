import {chromium} from '@playwright/test';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {screenshotReady} from './screenshot-ready';
// An explicit authoring command creates review candidates. CI never invokes this command.
const folder='evidence/visual/candidates';
if(fs.existsSync(folder+'/manifest.json'))throw Error('Candidates already exist. Review them; creation cannot overwrite a baseline.');
fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const screens=[['home','/bj'],['resale','/bj/buy'],['rent','/bj/rent'],['commercial','/bj/commercial'],['new-homes','/bj/new-homes'],['communities','/bj/communities'],['community','/bj/communities/willow-park'],['detail','/bj/buy/home-1'],['mortgage','/bj/tools/mortgage'],['filters','/bj/buy'],['city','/bj']];
const manifest:any[]=[];
try{const probe=await browser.newPage();const communities=await (await probe.request.get('http://localhost:8088/api/v1/communities?city=bj&limit=50')).json();await probe.close();if(communities.meta.total!==6)throw Error('Visual candidates require the six canonical communities. Run capture on a fresh isolated stack before browser mutations.');for(const [width,height] of [[390,844],[375,812],[1440,900]])for(const [id,route] of screens){
 const context=await browser.newContext({viewport:{width,height},locale:'en-GB',timezoneId:'Asia/Shanghai',reducedMotion:'reduce'});const page=await context.newPage();
 await page.goto('http://localhost:8088'+route);await page.waitForLoadState('networkidle');await screenshotReady(page,route==='/bj');
 if(id==='filters')await page.getByRole('button',{name:'All filters',exact:true}).click();
 if(id==='city'){await page.getByRole('button',{name:'Beijing',exact:true}).click();await page.getByLabel('Search cities',{exact:true}).fill('Beijing');}
 const file=`${id}-${width}.png`,bytes=await page.screenshot({path:folder+'/'+file,fullPage:true,animations:'disabled',mask:[page.locator('.stats-updated')]});
 manifest.push({id:id+'-'+width,route,viewport:{width,height},file,sha256:createHash('sha256').update(bytes).digest('hex'),evidenceLabel:'P',referenceParity:'unverified',approved:false,approvedBy:null,approvedAt:null});await context.close();
}
fs.writeFileSync(folder+'/manifest.json',JSON.stringify({renderer:browser.version(),maxDiffPixelRatio:0.005,screens:manifest},null,2)+'\n');
fs.writeFileSync(folder+'/index.html','<!doctype html><html lang="en"><meta charset="utf-8"><title>Haven proposed English baselines</title><style>body{font:16px system-ui;margin:24px}article{margin:40px 0}img{max-width:100%;border:1px solid #ccc}</style><h1>Proposed English baselines — awaiting review</h1><p>Local synthetic inventory. Reference parity is unverified. Candidates are never refreshed by CI.</p>'+manifest.map(screen=>`<article><h2>${screen.id} ${screen.route}</h2><a href="${screen.file}"><img loading="lazy" src="${screen.file}" alt="${screen.id}"></a></article>`).join(''));
console.log(`Captured ${manifest.length} proposed screens, renderer ${browser.version()}; human approval is pending.`);
}finally{await browser.close();}
