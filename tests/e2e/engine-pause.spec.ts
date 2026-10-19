import {test,expect} from '@playwright/test';
import {login} from '../support/browser';
const id='10000000-0000-4000-8000-000000001000',ops='http://localhost:8089',web='http://localhost:8088';

test('engine API is paused across public, owner, operator and worker routes',async({request})=>{
 const root=process.env.API_INTERNAL_URL!;
 expect(root).toBeTruthy();
 for(const [method,path] of [
  ['GET',`listings/${id}/digitization-tour`],['GET',`listings/${id}/digitization-model`],
  ['GET',`listings/${id}/digitization-packages/${id}/model`],['GET',`listings/${id}/digitization-packages/${id}/nodes/node-1/tiers/tier-1`],
  ['POST',`me/owner-listings/${id}/digitization`],['POST',`me/digitizations/${id}/evidence-grants`],
  ['GET',`me/digitizations/${id}/source-permissions`],['GET','ops/digitization-intakes'],
  ['POST',`ops/digitizations/${id}/process`],['GET',`ops/listings/${id}/digitization/events`],
  ['GET','ops/digitization-model-publication-reviews'],['POST','internal/digitization/maintenance/cleanup']
 ]){
  const response=await request.fetch(root+'/api/v1/'+path,{method,headers:{Origin:ops},...(method==='POST'?{data:{}}:{})});
  expect(response.status(),path).toBe(503);expect((await response.json()).error.code,path).toBe('DIGITIZATION_DISABLED');
  expect(response.headers()['cache-control']).toBe('no-store');
 }
});

test('engine controls and owner deep links are inaccessible while normal pages remain available',async({page},info)=>{
 test.setTimeout(180000);
 const engineRequests:string[]=[];page.on('request',request=>{if(request.url().includes('/api/v1/')&&request.url().includes('digitization'))engineRequests.push(request.url());});
 const listings=await page.request.get(web+'/api/v1/listings?city=bj&transaction=sale&segment=residential&limit=1');expect(listings.ok()).toBe(true);
 const listing=(await listings.json()).data[0];
 await page.goto(web+'/bj/buy/'+listing.slug+'?media=3d');await expect(page.getByRole('heading',{name:listing.title,exact:true}).first()).toBeVisible();
 await login(page,'owner',web,'/account/properties?modelSource='+id);await expect(page.getByRole('heading',{name:'Your property media',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Grant scoped model permissions',exact:true})).toHaveCount(0);
 await login(page,'agent',ops,'/ops/listings');await expect(page.getByRole('button',{name:'Create property draft',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Digitize property',exact:true})).toHaveCount(0);
 await page.goto(ops+'/ops/digitization?workspace='+id);await expect(page.getByRole('heading',{name:'Digitalization is temporarily disabled',exact:true})).toBeVisible();
 await page.screenshot({path:'evidence/digitization-pause/disabled-'+info.project.name+'.png'});
 await login(page,'moderator',ops,'/ops/reviews');await expect(page.getByRole('heading',{name:'Pending listing revisions',exact:true})).toBeVisible();
 const queue=await page.request.get(ops+'/api/v1/ops/reviews');expect(queue.ok()).toBe(true);
 expect((await queue.json()).data.revisions.every((row:any)=>!row.changes.digitizationPackage&&!row.changes.unitFacts)).toBe(true);
 expect(engineRequests).toEqual([]);
});
