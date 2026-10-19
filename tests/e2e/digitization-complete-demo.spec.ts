import fs from 'node:fs';
import {test,expect,type Page} from '@playwright/test';
import {login} from '../support/browser';

/** Opt-in retained development example. All mutations use authenticated API routes. */
test('publish and exercise a complete synthetic property example',async({page,browser})=>{
 test.skip(process.env.CREATE_DIGITIZATION_DEMO!=='true','Explicit opt-in creates and retains a local synthetic listing.');
 test.skip(fs.existsSync('infra/generated/digitization-realistic-demo.json'),'This retained example has been upgraded; use digitization-realistic-demo.spec.ts to resume or validate it.');
 test.setTimeout(300000);
 const ops=process.env.PUBLIC_OPS_URL||'http://localhost:8089',web=process.env.PUBLIC_WEB_URL||'http://localhost:8088';
 expect(new URL(ops).hostname).toBe('localhost');expect(new URL(web).hostname).toBe('localhost');
 const checkpoint='infra/generated/digitization-complete-demo.json';fs.mkdirSync('infra/generated',{recursive:true});
 const state:any=fs.existsSync(checkpoint)?JSON.parse(fs.readFileSync(checkpoint,'utf8')):{assets:{},media:{},bindings:{},runs:{}};
 const save=()=>fs.writeFileSync(checkpoint,JSON.stringify(state,null,2)+'\n');
 async function api(actor:Page,path:string,body?:unknown,method=body===undefined?'GET':'POST'){
  const response=await actor.request.fetch(ops+'/api/v1'+path,{method,headers:{Origin:ops,'idempotency-key':crypto.randomUUID()},...(body===undefined?{}:{data:body})});
  if(!response.ok())throw Error(`${method} ${path}: ${response.status()} ${await response.text()}`);
  return (await response.json()).data;
 }
 await login(page,'agent',ops,'/ops');
 const moderatorContext=await browser.newContext(),moderator=await moderatorContext.newPage();
 await login(moderator,'moderator',ops,'/ops');
 const rooms=JSON.parse(fs.readFileSync('assets/digitization-demo/rooms.json','utf8'));
 const provenance='SYNTHETIC TEST PROPERTY. Computer-authored geometry and rendered imagery; dimensions are unverified. Not a real property or offer for sale.';
 async function upload(file:string,purpose:string,visibility='public'){
  const key=visibility+':'+file;if(state.assets[key])return state.assets[key];
  const bytes=fs.readFileSync('assets/digitization-demo/'+file),mime=file.endsWith('.pdf')?'application/pdf':'image/png';
  const intent=await api(page,'/media/upload-intents',{mime,size:bytes.length,rights:'Original synthetic demo assets generated for this authorized local test.',visibility,purpose});
  const response=await page.request.put(ops+intent.uploadUrl,{headers:{Origin:ops,'Content-Type':mime},data:bytes});
  if(!response.ok())throw Error(`Upload ${file}: ${response.status()} ${await response.text()}`);
  state.assets[key]=await api(page,'/media/'+intent.id+'/status');save();return state.assets[key];
 }
 if(!state.listing){state.listing=await api(page,'/ops/listings',{title:'SYNTHETIC DEMO - Two-bedroom digital apartment',description:provenance+' Explore five rendered 360-degree room viewpoints, the authored 2D floor plan and its interactive 3D model. The AI interior concept is illustrative; the simple rendered room images match the authored room sizes. Price and address are fictional test data. Automated demo workflow reviews are not independent human or real-property verification.',transaction:'sale',segment:'residential',currency:'CNY',price:'1200000.00',rentPeriod:null,furnishing:'Synthetic furnished example',features:['Synthetic test property','Five 360 viewpoints','2D floor plan','Plan-derived 3D model'],unit:{communityId:'10000000-0000-4000-8000-000000000040',area:'80.00',beds:2,livingRooms:1,baths:1,orientation:'Illustrative north',floor:1,privateAddress:'DEMO-001 - fictional test apartment, no real address'}});save();}
 const id=state.listing.id,workbench=()=>api(page,`/ops/listings/${id}/media`);
 async function attach(key:string,file:string,kind:string,title:string,position:number,metadata:any={hotspots:[],caption:provenance}){
  if(state.media[key])return state.media[key];
  const asset=await upload(file,kind),current=await workbench();
  state.media[key]=await api(page,`/ops/listings/${id}/media`,{assetId:asset.id,kind,title,position,version:current.listing.version,metadata});save();return state.media[key];
 }
 await attach('concept','interior-concept.png','photo','AI interior concept - synthetic illustration',0,{hotspots:[],caption:provenance+' AI design concept; not a photograph or an exact match to the authored geometry.'});
 for(const [index,r] of rooms.entries()){
  await attach(r.id+'-photo',r.id+'-photo.png','photo',r.label+' - synthetic rendering',index+1);
  await attach(r.id,r.id+'-panorama.png','panorama',r.label+' - rendered 360',index+10);
 }
 const spatial={name:'Demo apartment - authored layout',level:1,widthMetres:12,depthMetres:11,elevationMetres:0,northDegrees:0,rooms:rooms.map((r:any)=>({id:r.id,label:r.label,sceneId:state.media[r.id].id,heightMetres:2.8,polygon:[{x:(100+r.x*100)/1200,y:(150+r.y*100)/1100},{x:(100+(r.x+r.w)*100)/1200,y:(150+r.y*100)/1100},{x:(100+(r.x+r.w)*100)/1200,y:(150+(r.y+r.d)*100)/1100},{x:(100+r.x*100)/1200,y:(150+(r.y+r.d)*100)/1100}],camera:{x:(100+(r.x+r.w/2)*100)/1200,y:(150+(r.y+r.d/2+(r.id==='living'?1.7:.6))*100)/1100,headingDegrees:0}}))};
 await attach('plan','floor-plan.png','floor_plan','Authored apartment floor plan - synthetic',30,{hotspots:[],caption:provenance+' 10 x 8 m schematic envelope, 2.8 m authored ceiling. Room outlines omit wall thickness; the 3D model is an extrusion, not a scanned reconstruction.',spatial});
 // Link each rendered viewpoint to the other rooms before submitting media review.
 for(const r of rooms){const media=state.media[r.id];if(!state['linked-'+r.id]){const updated=await api(page,`/ops/property-media/${media.id}`,{title:media.title,position:media.position,version:media.version,metadata:{caption:provenance+' Rendered equirectangular panorama. Room changes jump between fixed viewpoints.',hotspots:rooms.filter((target:any)=>target.id!==r.id).map((target:any,index:number)=>({targetId:state.media[target.id].id,label:target.label,yaw:-120+index*70,pitch:-12}))}},'PATCH');state.media[r.id]=updated;state['linked-'+r.id]=true;save();}}
 for(const media of (await workbench()).media)if(media.status==='draft'||media.pending_metadata)await api(moderator,`/ops/property-media/${media.id}/review`,{version:media.version,decision:'approved',reason:'Automated local fixture review of self-authored synthetic content; no real-property, measurement or independent human approval is represented.'});
 let listing=(await workbench()).listing;
 if(!state.assignmentChecked){const detail=await api(page,`/ops/listings/${id}/workbench`);if(detail.agent_id!=='10000000-0000-4000-8000-000000000060'){const managerContext=await browser.newContext(),manager=await managerContext.newPage();await login(manager,'admin',ops,'/ops');await api(manager,'/ops/assignments',{listingId:id,agentId:'10000000-0000-4000-8000-000000000060',version:listing.version,policy:'preserve_leads',reason:'Repair demo assignment to existing eligible profile after draft selection defect.'});await managerContext.close();listing=(await workbench()).listing;}state.assignmentChecked=true;save();}
 for(const status of ['submitted','under_review','published']){if(['draft','submitted','under_review'].indexOf(listing.status)===['submitted','under_review','published'].indexOf(status)){listing=await api(status==='submitted'?page:moderator,`/ops/listings/${id}/transition`,{version:listing.version,status,reason:'Publish explicitly fictional local test property through demo roles; authored facts and rights checked for this fixture only. No real-property verification.',...(status==='published'?{verified:true}:{})});save();}}
 // Attach source files to an accessible listing-linked digitization workspace.
 if(!state.workspace){state.workspace=await api(page,`/ops/listings/${id}/digitization`,{listingVersion:listing.version,authorityConfirmed:true});save();}
 const sources=[{file:'property-test-document.pdf',purpose:'document',uploadPurpose:'document'}, {file:'floor-plan.png',purpose:'plan',uploadPurpose:'floor_plan'},...rooms.map((r:any)=>({file:r.id+'-panorama.png',purpose:'panorama',uploadPurpose:'panorama'}))];
 for(const source of sources){if(state.bindings[source.file])continue;const asset=await upload(source.file,source.uploadPurpose,'private'),w=await api(page,`/ops/digitizations/${state.workspace.id}`);state.bindings[source.file]=await api(page,`/ops/listings/${id}/digitization/asset-bindings`,{version:w.version,inputRevision:w.inputRevision+1,assetId:asset.id,assetVersion:asset.version,purpose:source.purpose});save();}
 for(const source of sources){
  if(!state.runs[source.file]){const w=await api(page,`/ops/digitizations/${state.workspace.id}`);state.runs[source.file]=await api(page,`/ops/digitizations/${w.id}/process`,{version:w.version,inputRevision:w.inputRevision,assetId:state.assets['private:'+source.file].id,output:source.purpose==='document'?'facts':source.purpose,locale:'en'});save();}
  // Respect the agency's processing quota; inspect completion before starting more work.
  await expect.poll(async()=>{const runs=await api(page,`/ops/digitizations/${state.workspace.id}/runs`);return runs.every((r:any)=>r.stages.every((stage:any)=>stage.state==='succeeded'));},{timeout:120000,intervals:[1000,2000,3000]}).toBe(true);
 }
 state.publicUrl=web+'/bj/buy/'+state.listing.slug;state.workspaceUrl=ops+'/ops/digitization?workspace='+state.workspace.id;save();console.log(JSON.stringify({listingId:id,publicUrl:state.publicUrl,workspaceUrl:state.workspaceUrl}));
 await moderatorContext.close();
 const publicContext=await browser.newContext(),visitor=await publicContext.newPage();
 await visitor.goto(state.publicUrl);await expect(visitor.getByRole('heading',{name:state.listing.title,exact:true})).toBeVisible();
 const gallery=visitor.getByRole('region',{name:'Property gallery'});await expect(gallery.getByRole('button',{name:'Photos (6)',exact:true})).toBeVisible();
 await expect.poll(()=>gallery.locator('img').evaluateAll(images=>images.some(img=>(img as HTMLImageElement).naturalWidth>0))).toBe(true);
 await gallery.getByRole('button',{name:/Floor plans/}).click();await expect(gallery.getByRole('img',{name:'Authored apartment floor plan - synthetic'})).toBeVisible();
 await gallery.getByRole('button',{name:'Open Authored apartment floor plan - synthetic'}).click();const dialog=visitor.getByRole('dialog',{name:'Interactive property tour'});
 await dialog.getByRole('button',{name:'3D model',exact:true}).click();await expect(dialog.getByRole('status').filter({hasText:'3D model ready'})).toHaveText('3D model ready');
 const model=dialog.getByRole('img',{name:'Interactive 3D property model'});await model.focus();await model.press('ArrowRight');await dialog.screenshot({path:'evidence/digitization/complete-demo-3d.png'});
 await dialog.getByRole('button',{name:'Tour',exact:true}).click();const panorama=dialog.locator('canvas');await expect(panorama).toBeVisible();
 await expect(panorama).toHaveAttribute('data-panorama-ready','true');
 await dialog.getByRole('group',{name:'Tour scenes'}).getByRole('button',{name:'Bedroom one - rendered 360',exact:true}).click();await expect(dialog.locator('canvas')).toHaveAttribute('data-panorama-ready','true');
 await dialog.screenshot({path:'evidence/digitization/complete-demo-360.png'});
 await visitor.keyboard.press('Escape');await visitor.screenshot({path:'evidence/digitization/complete-demo-property.png',fullPage:true});
 state.validatedAt=new Date().toISOString();save();await publicContext.close();
});
