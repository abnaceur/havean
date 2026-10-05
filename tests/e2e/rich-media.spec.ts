import {test,expect} from '@playwright/test';
import {login,apiRequest} from '../support/browser';
test('D08/D09/F12 short video, floor-plan viewer and linked 360 scenes publish through moderation',async({page,browser},info)=>{
 test.setTimeout(240000);
 const suffix=info.project.name+'-'+crypto.randomUUID().slice(0,8),listingId='10000000-0000-4000-8000-000000002000';
 await login(page,'agent','http://localhost:8089','/ops/listings');
 expect((await page.request.get('http://localhost:8089/api/v1/listings/'+listingId)).ok()).toBe(true);
 await page.locator('tr[data-record-id="'+listingId+'"]').getByRole('button',{name:'Media',exact:true}).click();
 const media:any[]=[];
 for(const [kind,file,title] of [
  ['video','property-demo.mp4','Short video '+suffix],
  ['floor_plan','property-plan.png','Floor plan '+suffix],
  ['panorama','panorama-living.png','Living scene '+suffix],
  ['panorama','panorama-bedroom.png','Bedroom scene '+suffix]
 ]){
  await page.getByLabel('Media type',{exact:true}).selectOption(kind);
  await page.getByLabel('Media title',{exact:true}).fill(title);
  await page.getByLabel('Media caption',{exact:true}).fill('Synthetic demonstration asset. No real property represented.');
  await page.getByLabel('Rights / source',{exact:true}).fill('Project generated synthetic test asset');
  await page.getByLabel('Property media file',{exact:true}).setInputFiles('packages/test-support/assets/'+file);
  await page.getByRole('checkbox',{name:'I have the rights and permission to publish this media.',exact:true}).check();
  await page.getByRole('button',{name:'Upload and submit for review',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Upload prepared and submitted for moderation.'})).toBeVisible();
  const state=(await (await page.request.get('http://localhost:8089/api/v1/ops/listings/'+listingId+'/media')).json()).data;
  const row=state.media.find((m:any)=>m.title===title);expect(row).toBeTruthy();media.push(row);
 }
 const [video,plan,living,bedroom]=media;
 const anonymous=await browser.newContext();try{const response=await anonymous.request.get('http://localhost:8088/api/v1/media/'+video.asset_id+'/video');expect(response.status()).toBe(404);}finally{await anonymous.close();}
 await page.locator('#media-edit-'+living.id).getByRole('button',{name:'Edit details / hotspots',exact:true}).click();
 await page.getByRole('button',{name:'Add scene hotspot',exact:true}).click();
 await page.getByLabel('Destination scene 1',{exact:true}).selectOption(bedroom.id);
 await page.getByLabel('Hotspot label 1',{exact:true}).fill('Bedroom');
 await page.getByRole('button',{name:'Submit media revision',exact:true}).click();
 let publicMedia=(await (await page.request.get('http://localhost:8089/api/v1/listings/'+listingId+'/media')).json()).data;
 expect(publicMedia.some((m:any)=>media.some(r=>r.id===m.id))).toBe(false);
 const denied=await apiRequest(page,'/ops/property-media/'+video.id+'/review',{decision:'approved',reason:'Cannot self approve',version:video.version});
 expect(denied.status()).toBe(403);
 const wrongOrg=await page.request.get('http://localhost:8089/api/v1/ops/listings/'+listingId+'/media',{headers:{'x-organization-id':'10000000-0000-4000-8000-000000000005'}});
 expect(wrongOrg.status()).toBe(403);
 const moderatorContext=await browser.newContext({viewport:page.viewportSize()!});const moderator=await moderatorContext.newPage();
 try{
  await login(moderator,'moderator','http://localhost:8089','/ops/reviews');
  for(const item of media){
   await moderator.locator('#media-review-'+item.id).getByRole('button',{name:'Review property media',exact:true}).click();
   await moderator.getByLabel('Media review reason',{exact:true}).fill('Reviewed synthetic test rights, decoded content and captions.');
   await moderator.getByRole('checkbox',{name:'I reviewed the media, its captions and publishing rights.',exact:true}).check();
   await moderator.getByRole('button',{name:'Save media decision',exact:true}).click();
   await expect(moderator.locator('#media-review-'+item.id)).toHaveCount(0);
  }
  publicMedia=(await (await page.request.get('http://localhost:8089/api/v1/listings/'+listingId+'/media')).json()).data;
  expect(publicMedia.find((m:any)=>m.id===living.id).hotspots[0].targetId).toBe(bedroom.id);
  // Pending edits retain the currently approved public caption until the reviewer approves them.
  const state=(await (await page.request.get('http://localhost:8089/api/v1/ops/listings/'+listingId+'/media')).json()).data;
  const fresh=state.media.find((m:any)=>m.id===plan.id);
  const edit=await apiRequest(page,'/ops/property-media/'+plan.id,{title:plan.title,position:0,metadata:{caption:'Reviewed plan revision',hotspots:[]},version:fresh.version},'PATCH');expect(edit.ok()).toBe(true);
  const unchanged=(await (await page.request.get('http://localhost:8089/api/v1/listings/'+listingId+'/media')).json()).data.find((m:any)=>m.id===plan.id);
  expect(unchanged.caption).toBe('Synthetic demonstration asset. No real property represented.');
  const stale=await apiRequest(page,'/ops/property-media/'+plan.id,{title:plan.title,position:0,metadata:{caption:'stale',hotspots:[]},version:fresh.version},'PATCH');expect(stale.status()).toBe(409);
  const reviewed=await moderator.request.post('http://localhost:8089/api/v1/ops/property-media/'+plan.id+'/review',{headers:{Origin:'http://localhost:8089'},data:{decision:'approved',reason:'Verified plan revision',version:(await edit.json()).data.version}});expect(reviewed.ok()).toBe(true);
 }finally{await moderatorContext.close();}
 const publicVideo=publicMedia.find((m:any)=>m.id===video.id);
 const range=await page.request.get('http://localhost:8089'+publicVideo.url,{headers:{Range:'bytes=0-99'}});
 expect(range.status()).toBe(206);expect((await range.body()).length).toBe(100);expect(range.headers()['content-range']).toMatch(/^bytes 0-99\//);
 const invalidRange=await page.request.get('http://localhost:8089'+publicVideo.url,{headers:{Range:'bytes=999999999999-'}});expect(invalidRange.status()).toBe(416);
 await page.goto('http://localhost:8088/bj/buy/home-1');
 await page.getByRole('button',{name:/^Property videos/}).click();
 if(await page.getByLabel('Property video',{exact:true}).count())await page.getByLabel('Property video',{exact:true}).selectOption(video.id);
 const player=page.getByLabel(video.title,{exact:true});await expect(player).toBeVisible();
 await expect.poll(()=>player.evaluate((v:HTMLVideoElement)=>v.readyState)).toBeGreaterThanOrEqual(1);
 await player.evaluate(async(v:HTMLVideoElement)=>{v.muted=true;await v.play();});
 await expect.poll(()=>player.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(0);await player.evaluate((v:HTMLVideoElement)=>v.pause());
 await page.getByRole('button',{name:/^Floor plans/}).click();if(await page.getByLabel('Property floor plan',{exact:true}).count())await page.getByLabel('Property floor plan',{exact:true}).selectOption(plan.id);await page.getByRole('button',{name:'Open '+plan.title,exact:true}).click();
 await page.getByRole('button',{name:'Zoom in',exact:true}).click();await expect(page.getByText('125%',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Close dialog',exact:true}).click();
 await page.getByRole('button',{name:/^360° tour/}).click();await page.getByRole('button',{name:'Tour controls',exact:true}).click();await page.getByLabel('Tour viewpoint',{exact:true}).selectOption(living.id);
 const canvas=page.getByRole('img',{name:'360 degree view: '+living.title,exact:true});await expect(canvas).toBeVisible();
 await page.getByRole('button',{name:'Tour controls',exact:true}).click();await page.getByRole('button',{name:'Turn right',exact:true}).click();await expect(page.getByText(/View 15° \/ 0°/)).toBeVisible();
 await page.getByRole('button',{name:'Go to Bedroom',exact:true}).click();await expect(page.getByRole('button',{name:bedroom.title,exact:true})).toHaveAttribute('aria-pressed','true');
 expect(await page.evaluate(width=>document.documentElement.scrollWidth<=width,page.viewportSize()!.width)).toBe(true);
 await page.screenshot({path:`evidence/rich-media-${info.project.name}.png`,fullPage:true});
});

test('F12 scan rejection, spoofed video MIME and oversized upload intents',async({page})=>{
 await login(page,'owner');
 const infected=Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
 const intent=await page.request.post('/api/v1/media/upload-intents',{headers:{Origin:'http://localhost:8088'},data:{mime:'application/pdf',size:infected.length,visibility:'private',rights:'Synthetic antivirus test'}});expect(intent.ok()).toBe(true);
 const rejected=await page.request.put((await intent.json()).data.uploadUrl,{headers:{Origin:'http://localhost:8088','Content-Type':'application/pdf'},data:infected});expect(rejected.status()).toBe(400);expect((await rejected.json()).error.code).toBe('UNSAFE_FILE');
 const tooLarge=await page.request.post('/api/v1/media/upload-intents',{headers:{Origin:'http://localhost:8088'},data:{mime:'video/mp4',size:40*1024*1024+1,visibility:'public',purpose:'video',rights:'Synthetic oversized test'}});expect(tooLarge.status()).toBe(400);
 const fake=Buffer.from('not a video');const videoIntent=await page.request.post('/api/v1/media/upload-intents',{headers:{Origin:'http://localhost:8088'},data:{mime:'video/mp4',size:fake.length,visibility:'public',purpose:'video',rights:'Synthetic MIME test'}});
 const spoof=await page.request.put((await videoIntent.json()).data.uploadUrl,{headers:{Origin:'http://localhost:8088','Content-Type':'video/mp4'},data:fake});expect(spoof.status()).toBe(400);
});

test('development floor-plan drawings are uploaded, reviewed and displayed with plan inventory',async({page,browser},info)=>{
 test.setTimeout(180000);
 const developmentId='10000000-0000-4000-8000-000000003000',planId='10000000-0000-4000-8000-000000003100',title='Type A drawing '+info.project.name+' '+crypto.randomUUID().slice(0,6);
 await login(page,'developer','http://localhost:8089','/ops/developments');
 await page.locator('tr[data-record-id="'+developmentId+'"]').getByRole('button',{name:'Development media',exact:true}).click();
 await page.getByLabel('Media type',{exact:true}).selectOption('floor_plan');
 await page.getByLabel('Associated floor plan',{exact:true}).selectOption(planId);
 await page.getByLabel('Media title',{exact:true}).fill(title);
 await page.getByLabel('Media caption',{exact:true}).fill('Illustrative synthetic plan, not measured.');
 await page.getByLabel('Rights / source',{exact:true}).fill('Project generated synthetic drawing');
 await page.getByLabel('Property media file',{exact:true}).setInputFiles('packages/test-support/assets/property-plan.png');
 await page.getByRole('checkbox',{name:'I have the rights and permission to publish this media.',exact:true}).check();
 await page.getByRole('button',{name:'Upload and submit for review',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'Upload prepared and submitted for moderation.'})).toBeVisible();
 const workbench=(await (await page.request.get('http://localhost:8089/api/v1/ops/developments/'+developmentId+'/media')).json()).data;
 const media=workbench.media.find((m:any)=>m.title===title);expect(media.floor_plan_id).toBe(planId);
 const before=(await (await page.request.get('http://localhost:8089/api/v1/developments/'+developmentId+'/media')).json()).data;expect(before.some((m:any)=>m.id===media.id)).toBe(false);
 const context=await browser.newContext({viewport:page.viewportSize()!});const moderator=await context.newPage();
 try{await login(moderator,'moderator','http://localhost:8089','/ops/reviews');
  await moderator.locator('#media-review-'+media.id).getByRole('button',{name:'Review property media',exact:true}).click();
  await moderator.getByLabel('Media review reason',{exact:true}).fill('Reviewed illustrative drawing and publishing rights.');
  await moderator.getByRole('checkbox',{name:'I reviewed the media, its captions and publishing rights.',exact:true}).check();
  await moderator.getByRole('button',{name:'Save media decision',exact:true}).click();
  await expect(moderator.locator('#media-review-'+media.id)).toHaveCount(0);
 }finally{await context.close();}
 await page.goto('http://localhost:8088/bj/new-homes/garden-collection-1');
 await page.getByRole('button',{name:/^Floor plans/}).click();if(await page.getByLabel('Property floor plan',{exact:true}).count())await page.getByLabel('Property floor plan',{exact:true}).selectOption(media.id);await page.getByRole('button',{name:'Open '+title,exact:true}).click();
 await expect(page.getByRole('dialog').getByRole('img',{name:title,exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Zoom in',exact:true}).click();await expect(page.getByText('125%',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Close dialog',exact:true}).click();
 await expect(page.getByRole('img',{name:'Type A floor-plan drawing',exact:true})).toBeVisible();
});
