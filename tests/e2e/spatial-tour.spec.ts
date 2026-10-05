import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {login,apiRequest} from '../support/browser';
test('mapped rooms, multiple floors and real 3D geometry publish only after moderation',async({page,browser},info)=>{
 test.setTimeout(240000);
 const listingId='10000000-0000-4000-8000-000000002000',suffix=info.project.name+'-'+crypto.randomUUID().slice(0,6);
 await login(page,'agent','http://localhost:8089','/ops/listings');
 await page.locator('tr[data-record-id="'+listingId+'"]').getByRole('button',{name:'Media',exact:true}).click();
 const assets:any[]=[];
 for(const [kind,file,label] of [['floor_plan','property-plan.png','Ground'],['floor_plan','property-plan.png','Upper'],['panorama','panorama-living.png','Living'],['panorama','panorama-bedroom.png','Bedroom']]){
  const title=label+' spatial '+suffix;
  await page.getByLabel('Media type',{exact:true}).selectOption(kind);
  await page.getByLabel('Media title',{exact:true}).fill(title);
  await page.getByLabel('Media caption',{exact:true}).fill('Synthetic demonstration, not a surveyed or scanned property.');
  await page.getByLabel('Rights / source',{exact:true}).fill('Project generated synthetic media');
  await page.getByLabel('Property media file',{exact:true}).setInputFiles('packages/test-support/assets/'+file);
  await page.getByRole('checkbox',{name:'I have the rights and permission to publish this media.',exact:true}).check();
  await page.getByRole('button',{name:'Upload and submit for review',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Upload prepared and submitted for moderation.'})).toBeVisible();
  assets.push((await (await page.request.get('http://localhost:8089/api/v1/ops/listings/'+listingId+'/media')).json()).data.media.find((row:any)=>row.title===title));
 }
 const [ground,upper,living,bedroom]=assets;
 for(const [plan,scene,name,level] of [[ground,living,'Ground floor '+suffix,0],[upper,bedroom,'Upper floor '+suffix,1]] as const){
  await page.locator('#media-edit-'+plan.id).getByRole('button',{name:'Edit details / hotspots',exact:true}).click();
  await page.getByRole('checkbox',{name:'Map rooms and build a spatial model',exact:true}).check();
  await page.getByLabel('Floor name',{exact:true}).fill(name);
  await page.getByLabel('Floor level',{exact:true}).fill(String(level));
  await page.getByLabel('Floor elevation (m)',{exact:true}).fill(String(level*3));
  await page.getByRole('button',{name:'Add mapped room',exact:true}).click();
  await page.getByLabel('Room name 1',{exact:true}).fill(level?'Upper bedroom':'Ground living');
  await page.getByLabel('Room viewpoint 1',{exact:true}).selectOption(scene.id);
  await page.getByLabel('Viewpoint left (%) 1',{exact:true}).fill('30');
  await page.getByLabel('Viewpoint top (%) 1',{exact:true}).fill('25');
  await page.getByRole('button',{name:'Submit media revision',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Edit property media'})).toHaveCount(0);
 }
 let publicRows=(await (await page.request.get('http://localhost:8089/api/v1/listings/'+listingId+'/media')).json()).data;
 expect(publicRows.some((row:any)=>assets.some(item=>item.id===row.id))).toBe(false);
 const workbench=(await (await page.request.get('http://localhost:8089/api/v1/ops/listings/'+listingId+'/media')).json()).data.media;
 const draft=workbench.find((row:any)=>row.id===ground.id);
 const spatial=draft.pending_metadata.spatial;expect(spatial.rooms[0].camera).toMatchObject({x:0.3,y:0.25});
 const invalid=await apiRequest(page,'/ops/property-media/'+ground.id,{title:ground.title,position:0,metadata:{caption:'Invalid geometry',hotspots:[],spatial:{...spatial,rooms:[{...spatial.rooms[0],camera:{x:0.99,y:0.99,headingDegrees:0}}]}},version:draft.version},'PATCH');expect(invalid.status()).toBe(400);
 const foreign=await apiRequest(page,'/ops/property-media/'+ground.id,{title:ground.title,position:0,metadata:{caption:'Invalid reference',hotspots:[],spatial:{...spatial,rooms:[{...spatial.rooms[0],sceneId:crypto.randomUUID()}]}},version:draft.version},'PATCH');expect(foreign.status()).toBe(400);
 const self=await apiRequest(page,'/ops/property-media/'+ground.id+'/review',{decision:'approved',reason:'Self approval forbidden',version:draft.version});expect(self.status()).toBe(403);
 const context=await browser.newContext({viewport:page.viewportSize()!});const moderator=await context.newPage();
 try{
  await login(moderator,'moderator','http://localhost:8089','/ops/reviews');
  // A reviewed floor must not expose the IDs or room geometry of an unapproved panorama.
  const approved=await apiRequest(moderator,'/ops/property-media/'+ground.id+'/review',{decision:'approved',reason:'Reviewed synthetic dimensions and room mapping',version:draft.version});expect(approved.ok()).toBe(true);
  publicRows=(await (await page.request.get('http://localhost:8089/api/v1/listings/'+listingId+'/media')).json()).data;
  expect(publicRows.find((row:any)=>row.id===ground.id).spatial.rooms).toEqual([]);
  for(const asset of [upper,living,bedroom]){
   const fresh=(await (await page.request.get('http://localhost:8089/api/v1/ops/listings/'+listingId+'/media')).json()).data.media.find((row:any)=>row.id===asset.id);
   const review=await apiRequest(moderator,'/ops/property-media/'+asset.id+'/review',{decision:'approved',reason:'Reviewed synthetic media and spatial references',version:fresh.version});expect(review.ok()).toBe(true);
  }
  // Published layout remains stable until its proposed revision has a separate approval.
  const fresh=(await (await page.request.get('http://localhost:8089/api/v1/ops/listings/'+listingId+'/media')).json()).data.media.find((row:any)=>row.id===ground.id);
  const edited=await apiRequest(page,'/ops/property-media/'+ground.id,{title:ground.title,position:0,metadata:{...fresh.metadata,spatial:{...fresh.metadata.spatial,name:'Reviewed ground '+suffix}},version:fresh.version},'PATCH');expect(edited.ok()).toBe(true);
  publicRows=(await (await page.request.get('http://localhost:8089/api/v1/listings/'+listingId+'/media')).json()).data;
  expect(publicRows.find((row:any)=>row.id===ground.id).spatial.name).toBe('Ground floor '+suffix);
  const review=await apiRequest(moderator,'/ops/property-media/'+ground.id+'/review',{decision:'approved',reason:'Approved floor name revision',version:(await edited.json()).data.version});expect(review.ok()).toBe(true);
  const published=(await (await page.request.get('http://localhost:8089/api/v1/ops/listings/'+listingId+'/media')).json()).data.media.find((row:any)=>row.id===ground.id);
  const moderatorEdit=await apiRequest(moderator,'/ops/property-media/'+ground.id,{title:ground.title,position:0,metadata:{...published.metadata,caption:'Moderator authored change'},version:published.version},'PATCH');expect(moderatorEdit.ok()).toBe(true);
  const revisionVersion=(await moderatorEdit.json()).data.version;
  const ownReview=await apiRequest(moderator,'/ops/property-media/'+ground.id+'/review',{decision:'approved',reason:'Self authored revision must be denied',version:revisionVersion});expect(ownReview.status()).toBe(403);
  const withdraw=await apiRequest(moderator,'/ops/property-media/'+ground.id+'/review',{decision:'rejected',reason:'Withdraw own proposed revision',version:revisionVersion});expect(withdraw.ok()).toBe(true);
 }finally{await context.close();}
 await page.goto('http://localhost:8088/bj/buy/home-1');
 await expect(page.getByRole('region',{name:'Property gallery'})).toBeVisible();
 await page.getByRole('button',{name:/^Floor plans/}).click();
 if(await page.getByLabel('Property floor plan',{exact:true}).count())await page.getByLabel('Property floor plan',{exact:true}).selectOption(ground.id);
 await page.getByRole('button',{name:'Open '+ground.title,exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Interactive property tour'});
 await dialog.getByRole('button',{name:'Zoom in',exact:true}).click();await expect(dialog.getByText('125%',{exact:true})).toBeVisible();
 await dialog.getByRole('button',{name:'Fit plan',exact:true}).click();await expect(dialog.getByText('100%',{exact:true})).toBeVisible();
 await dialog.getByRole('button',{name:'Enter Ground living',exact:true}).press('Enter');
 await expect(dialog.getByRole('img',{name:'360 degree view: '+living.title,exact:true})).toBeVisible();
 const direction=dialog.locator('.plan-camera');const heading=await direction.getAttribute('data-heading');
 await dialog.getByRole('button',{name:'Tour controls',exact:true}).click();await dialog.getByRole('button',{name:'Turn right',exact:true}).click();await expect(direction).not.toHaveAttribute('data-heading',heading!);
 await dialog.getByLabel('Tour floor',{exact:true}).selectOption(upper.id);
 await expect(dialog.getByRole('img',{name:'360 degree view: '+bedroom.title,exact:true})).toBeVisible();
 await dialog.getByRole('button',{name:'3D model',exact:true}).click();
 await expect(dialog.getByRole('status').filter({hasText:'3D model ready'})).toHaveText(/3D model ready/);
 await dialog.getByRole('button',{name:'Orbit right',exact:true}).click();await expect(dialog.getByText('Orbit -15° · Tilt 50°',{exact:true})).toBeVisible();
 await dialog.getByLabel('Tour floor',{exact:true}).selectOption('all');
 await expect(dialog.locator('.model-room')).toHaveCount(2);
 await expect(dialog.getByRole('button',{name:'Ground living on Reviewed ground '+suffix,exact:true})).toBeVisible();await expect(dialog.getByRole('button',{name:'Upper bedroom on Upper floor '+suffix,exact:true})).toBeVisible();
 await dialog.getByRole('button',{name:'3D zoom in',exact:true}).click();
 await page.screenshot({path:'evidence/spatial-model-'+info.project.name+'.png',fullPage:true});
 await dialog.getByLabel('3D room',{exact:true}).selectOption(ground.id+':'+living.id);await expect(dialog.getByRole('img',{name:'360 degree view: '+living.title,exact:true})).toBeVisible();
 expect(await page.evaluate(width=>document.documentElement.scrollWidth<=width,page.viewportSize()!.width)).toBe(true);
 await page.screenshot({path:'evidence/spatial-tour-'+info.project.name+'.png',fullPage:true});
 const accessibility=await new AxeBuilder({page}).include('.tour-viewer').analyze();expect(accessibility.violations.filter(issue=>issue.impact==='serious'||issue.impact==='critical')).toEqual([]);
 await page.goto('http://localhost:8088/bj/buy/home-1?media=vr&floor='+ground.id);
 await expect(page.getByRole('dialog',{name:'Interactive property tour'}).getByRole('img',{name:'360 degree view: '+living.title,exact:true})).toBeVisible();
 await page.goto('http://localhost:8088/bj/buy/home-1?media=plan&floor='+ground.id);
 await expect(page.getByRole('dialog',{name:'Interactive property tour'}).getByRole('img',{name:ground.title,exact:true})).toBeVisible();
});
