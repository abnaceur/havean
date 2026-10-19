import fs from 'node:fs';
import {test,expect,type Page} from '@playwright/test';
import {login} from '../support/browser';

// Explicit local demo update, using the same versioned API and separate review
// roles as the agent workflow. It never represents human or surveyed approval.
test('publish the complete authored apartment and generated room tour',async({page,browser})=>{
 const furnished=process.env.UPDATE_FURNISHED_DEMO==='true',assetDir=furnished?'assets/digitization-furnished':'assets/digitization-realistic',evidenceDir=furnished?'evidence/digitization/furnished':'evidence/digitization/coherent',suffix=furnished?' — rendered demo':' — generated demo';
 test.skip(!furnished&&process.env.UPDATE_COHERENT_DEMO!=='true','Opt-in update of the retained local synthetic example.');test.setTimeout(600000);
 const ops='http://localhost:8089',web='http://localhost:8088',file=furnished?'infra/generated/digitization-furnished-demo.json':'infra/generated/digitization-coherent-demo.json';
 const prior=JSON.parse(fs.readFileSync('infra/generated/digitization-agent-actions.json','utf8'));
 const s:any=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{assets:{},bindings:{},runs:{},media:{}};
 const layout=JSON.parse(fs.readFileSync('assets/digitization-coherent/layout.json','utf8'));
 const rooms=layout.rooms,id=prior.listingId,engine=prior.engineId,base=`/ops/digitizations/${engine}`;
 const save=()=>fs.writeFileSync(file,JSON.stringify(s,null,2)+'\n');
 const note='Automated synthetic demo-role review only. Original authored geometry and room imagery; no real-property capture, surveyed dimensions, human approval or automatic furniture reconstruction.';
 async function api(actor:Page,path:string,body?:unknown,method=body===undefined?'GET':'POST'){
  const response=await actor.request.fetch(ops+'/api/v1'+path,{method,headers:{Origin:ops,'idempotency-key':crypto.randomUUID()},...(body===undefined?{}:{data:body})});
  if(!response.ok())throw Error(`${method} ${path}: ${response.status()} ${await response.text()}`);return (await response.json()).data;
 }
 await login(page,'agent',ops,'/ops');const context=await browser.newContext(),reviewer=await context.newPage();await login(reviewer,'moderator',ops,'/ops');
 const workspace=()=>api(page,base),media=()=>api(page,`/ops/listings/${id}/media`);
 if(!s.parent){const g=await api(page,base+'/geometry'),t=await api(page,base+'/tour-revisions/latest');s.parent={geometry:g.geometry.revision,tour:t.revision};save();}
 async function upload(key:string,path:string,purpose:string,visibility:string){
  if(s.assets[key])return s.assets[key];const bytes=fs.readFileSync(path),intent=await api(page,'/media/upload-intents',{mime:'image/png',size:bytes.length,rights:note,purpose,visibility});
  const response=await page.request.put(ops+intent.uploadUrl,{headers:{Origin:ops,'Content-Type':'image/png'},data:bytes});expect(response.ok(),await response.text()).toBe(true);
  s.assets[key]=await api(page,`/media/${intent.id}/status`);save();return s.assets[key];
 }
 const inputs=[{id:'plan',path:'assets/digitization-coherent/floor-plan.png',purpose:'plan'},...rooms.map((r:any)=>({id:r.id,path:`${assetDir}/${r.id}-panorama.png`,purpose:'panorama'}))];
 for(const input of inputs){if(s.bindings[input.id])continue;const asset=await upload(input.id,input.path,input.purpose==='plan'?'floor_plan':'panorama','private'),w=await workspace();s.bindings[input.id]=await api(page,`/ops/listings/${id}/digitization/asset-bindings`,{version:w.version,inputRevision:w.inputRevision+1,assetId:asset.id,assetVersion:asset.version,purpose:input.purpose});save();}
 for(const input of inputs){
  if(!s.runs[input.id]){const w=await workspace();s.runs[input.id]=await api(page,base+'/process',{version:w.version,inputRevision:w.inputRevision,assetId:s.assets[input.id].id,output:input.purpose,locale:'en'});save();}
  await expect.poll(async()=>{const runs=await api(page,base+'/runs');const run=runs.find((r:any)=>r.id===s.runs[input.id].id);if(run?.state==='failed')throw Error(JSON.stringify(run));return run?.state;},{timeout:120000,intervals:[1000,2000]}).toBe('awaiting_review');
 }
 if(!s.trace){
  const pages=await api(page,base+'/plan-pages');s.pages=pages;save();expect(pages).toHaveLength(1);const p=pages[0];
  const selection=await api(page,base+`/artifacts/${p.artifactId}/plan-page?clockwiseDegrees=0`),w=await workspace(),source=selection.source,m=source.originalToModel;expect(source.assetId).toBe(s.assets.plan.id);
  const point=([x,y]:number[])=>{const px=layout.ox+x*layout.scale,py=layout.oy+y*layout.scale;return {x:m[0]*px+m[1]*py+m[2],y:m[3]*px+m[4]*py+m[5]};};
  const geometry={schemaVersion:2,id:crypto.randomUUID(),organizationId:w.organizationId,targetId:w.target.id,revision:s.parent.geometry+1,parentRevision:s.parent.geometry,coordinateSystem:'right-handed-z-up',unit:'px',scaleStatus:'unscaled',sourceAssets:[source.assetId],sources:[source],scaleAnchors:[],floors:[{id:'floor-1',name:'Demo apartment',elevation:'0',height:null,source}],rooms:rooms.map((r:any)=>({id:r.id,floorId:'floor-1',name:r.name,type:r.id.startsWith('bedroom')?'bedroom':r.id,polygon:[[r.x,r.y],[r.x+r.w,r.y],[r.x+r.w,r.y+r.d],[r.x,r.y+r.d]].map(point),holes:[],panoramaSceneId:null,source,areaBasis:'geometry_room_net'})),walls:layout.walls.map((w:any)=>({...w,start:point(w.start),end:point(w.end),floorId:'floor-1',thickness:'12',height:null,source,confirmed:true})),openings:layout.openings.map((o:any)=>({id:o.id,wallId:'wall-'+o.wall,offset:(o.offset*layout.scale).toFixed(4),width:(o.width*layout.scale).toFixed(4),type:o.type,sill:null,height:null,source,confirmed:true})),stairs:[],review:{status:'pending',actorId:null}};
  s.trace=await api(page,base+'/geometry',{version:w.version,artifactId:p.artifactId,clockwiseDegrees:0,geometry});save();
 }
 if(!s.calibration){s.calibration=await api(page,base+'/geometry/calibrate',{version:(await workspace()).version,geometryRevisionId:s.trace.geometry.id,wallId:'wall-0',distanceMetres:'10.00',note,observationConfirmed:true});save();}
 if(!s.dimensions){s.dimensions=await api(page,base+'/geometry/dimensions',{version:(await workspace()).version,geometryRevisionId:s.calibration.geometry.id,floorId:'floor-1',heightMetres:'2.80',note,suppliedDimensionsConfirmed:true,openings:layout.openings.map((o:any)=>({openingId:o.id,heightMetres:o.type==='door'?'2.10':'1.30',sillMetres:o.type==='door'?'0':'0.90'}))});save();}
 if(furnished&&!s.objectsSaved){s.dimensions=await api(page,base+'/geometry/furnishings',{version:(await workspace()).version,geometryRevisionId:s.dimensions.geometry.id,note,suppliedObjectsConfirmed:true,furnishings:JSON.parse(fs.readFileSync(assetDir+'/furnishings.json','utf8'))});s.objectsSaved=true;save();}
 if(!s.tour){
  const candidates=await api(page,base+'/panorama-candidates');s.candidates=candidates;save();const ids=Object.fromEntries(rooms.map((r:any)=>[r.id,crypto.randomUUID()]));
  const cameras=furnished?JSON.parse(fs.readFileSync(assetDir+'/cameras.json','utf8')):[],doors:Record<string,number[]>={kitchen:[1.55,5.96875],bathroom:[4.625,5.96875],'bedroom-one':[6,2.95],'bedroom-two':[6,5.475]};
  const nodes=rooms.map((r:any)=>{
   const candidate=candidates.find((c:any)=>c.captureId===s.assets[r.id].id),polygon=s.dimensions.geometry.rooms.find((g:any)=>g.id===r.id).polygon,camera=cameras.find((c:any)=>c[0]===r.id);expect(candidate).toBeTruthy();
   return {id:ids[r.id],label:r.name+suffix,tierArtifactIds:(furnished?[candidate.tiers.at(-1)]:candidate.tiers).map((t:any)=>t.artifactId),captureDeclaration:'genuine_360_capture',roomId:r.id,headingDegrees:furnished?0:null,planPosition:{floorId:'floor-1',x:camera?1+camera[1]:polygon.reduce((n:number,p:any)=>n+p.x,0)/4,y:camera?11.2-camera[2]:polygon.reduce((n:number,p:any)=>n+p.y,0)/4,confirmed:true},hotspots:(r.id==='living'?rooms.filter((r:any)=>r.id!=='living'):rooms.filter((r:any)=>r.id==='living')).map((target:any,i:number)=>{
    const door=doors[r.id==='living'?target.id:r.id];return {targetNodeId:ids[target.id],label:target.name,yaw:camera?Math.atan2(door[0]-camera[1],camera[2]-door[1])*180/Math.PI:-90+i*60,pitch:camera?Math.atan2(-.5,Math.hypot(door[0]-camera[1],door[1]-camera[2]))*180/Math.PI:-15};
   })};
  });
  const w=await workspace();s.tour=await api(page,base+'/tour-revisions',{workspaceVersion:w.version,inputRevision:w.inputRevision,baseTourRevision:s.parent.tour,graph:{schemaVersion:1,geometryRevisionId:s.dimensions.geometry.id,entryNodeId:ids.living,nodes}});save();
 }
 if(!s.modelReview){const w=await workspace();s.modelReview=await api(page,base+'/model-review-requests',{workspaceVersion:w.version,inputRevision:w.inputRevision,reviewerId:'00000000-0000-4000-8000-000000000008',previewDelegationConfirmed:true,modelType:'structural',geometryRevisionId:s.dimensions.geometry.id});save();}
 if(!s.modelApproved){const content=await reviewer.request.get(ops+`/api/v1/ops/digitization-model-reviews/${s.modelReview.id}/content`);expect(content.ok()).toBe(true);const bytes=await content.body();expect(bytes.toString('ascii',0,4)).toBe('glTF');fs.writeFileSync(evidenceDir+'/structural.glb',bytes);await api(reviewer,`/ops/digitization-model-reviews/${s.modelReview.id}/review`,{requestVersion:1,workspaceVersion:(await workspace()).version,decision:'approved',privacyConfirmed:true,limitationsConfirmed:true,reason:note});s.modelApproved=await api(page,`/ops/digitization-model-reviews/${s.modelReview.id}`);save();}
 const graph=s.tour.graph,includedNodeIds=graph.nodes.map((n:any)=>n.id),entryNodeId=graph.entryNodeId;
 if(!s.tourReview){s.tourReview=await api(page,base+'/tour-review-requests',{workspaceVersion:(await workspace()).version,tourRevisionId:s.tour.id,reviewerId:'00000000-0000-4000-8000-000000000008',includedNodeIds,entryNodeId,previewDelegationConfirmed:true});save();}
 if(!s.tourApproved){for(const node of graph.nodes){const response=await reviewer.request.get(ops+`/api/v1/ops/digitization-tour-reviews/${s.tourReview.id}/captures/${node.tierArtifactIds[0]}/preview`);expect(response.ok()).toBe(true);}s.tourApproved=await api(reviewer,`/ops/digitization-tour-reviews/${s.tourReview.id}/review`,{requestVersion:1,workspaceVersion:(await workspace()).version,decision:'approved',includedNodeIds,entryNodeId,projectionConfirmed:true,privacyConfirmed:true,reason:note});save();}
 for(const item of [{key:'public-plan',path:'assets/digitization-coherent/floor-plan.png',kind:'floor_plan',title:'Two-bedroom demo apartment plan',position:1},{key:'public-photo',path:furnished?assetDir+'/interior.png':'assets/digitization-demo/interior-concept.png',kind:'photo',title:'Generated apartment interior concept',position:0}]){
  if(!s.media[item.key]){const asset=await upload(item.key,item.path,item.kind,'public'),current=await media();s.media[item.key]=await api(page,`/ops/listings/${id}/media`,{assetId:asset.id,kind:item.kind,title:item.title,position:item.position,version:current.listing.version,metadata:{hotspots:[],caption:note}});save();}
  const row=(await media()).media.find((m:any)=>m.id===s.media[item.key].id);if(row.status!=='approved')await api(reviewer,`/ops/property-media/${row.id}/review`,{version:row.version,decision:'approved',reason:note});
 }
 for(const oldId of (await media()).media.filter((m:any)=>['photo','floor_plan'].includes(m.kind)&&!Object.values(s.media).some((n:any)=>n.id===m.id)).map((m:any)=>m.id)){const old=(await media()).media.find((m:any)=>m.id===oldId);if(old)await api(page,`/ops/property-media/${old.id}`,{version:old.version},'DELETE');}
 if(!s.descriptionApproved){if(!s.descriptionRevision){const listing=await api(page,`/ops/listings/${id}/workbench`);s.descriptionRevision=await api(page,`/ops/listings/${id}`,{version:listing.version,title:furnished?'Furnished two-bedroom demo apartment':'Generated two-bedroom demo apartment',price:listing.price,description:furnished?'SYNTHETIC FURNISHED DEMO — not a real property or an offer for sale. The 3D property includes 46 authored furniture and fixture objects: seating, tables, beds, wardrobes, cabinets, kitchen appliances, bath and shower fixtures, curtains and decor. All five room panoramas are rendered from this same model and object placements. The authored 95.50 m² envelope, 2.80 m ceiling and object sizes remain unverified. This is an illustrative furnished model, not automated capture reconstruction or independent human verification.':'SYNTHETIC DEMO — not a real property or an offer for sale. Explore five AI-generated furnished 360-degree room views, an authored two-bedroom floor plan and its matching architectural 3D model with doors and windows. The 95.50 m² schematic envelope and 2.80 m ceiling are authored inputs, not surveyed measurements. Panorama furnishings and camera headings are illustrative; they are not calibrated to the plan. The 3D model represents walls, floors and openings only, without reconstructed furniture. Automated demo-role workflow reviews do not represent human verification.',reason:note},'PATCH');save();}await api(reviewer,`/ops/revisions/${s.descriptionRevision.id}/approve`,{version:1,verified:true,reason:note});s.descriptionApproved=true;save();}
 for(const kind of ['model','tour']){
  if(!s[kind+'Proposal']){const p=await api(page,base+'/publication');s[kind+'Proposal']=await api(page,base+(kind==='model'?'/model-publication-proposals':'/publication-proposals'),{workspaceVersion:p.workspaceVersion,inputRevision:p.inputRevision,listingVersion:p.listing.version,approvalId:kind==='model'?s.modelApproved.approval.id:s.tourApproved.id,approvalVersion:1,publicationConsent:true,reason:note,...(kind==='model'?{reviewRequestId:s.modelReview.id}:{tourRevisionId:s.tour.id})});save();}
  if(!s[kind+'Published']){await api(reviewer,`/ops/revisions/${s[kind+'Proposal'].revisionId}/approve`,{version:1,verified:true,reason:note});s[kind+'Published']=true;save();}
 }
 await context.close();s.publicUrl=prior.publicUrl;save();
 const visitorContext=await browser.newContext(),visitor=await visitorContext.newPage(),errors:string[]=[];visitor.on('pageerror',e=>errors.push(e.message));
 const manifest=(await (await visitor.request.get(web+`/api/v1/listings/${id}/digitization-tour`)).json()).data;expect(manifest.nodes).toHaveLength(5);
 await visitor.goto(s.publicUrl+'?media=360');const tour=visitor.getByRole('dialog',{name:'Reviewed property captures',exact:true});
 for(const room of rooms){await tour.getByRole('group',{name:'Reviewed tour scenes'}).getByRole('button',{name:room.name+suffix,exact:true}).click();await expect(tour.getByRole('img',{name:'360 degree view: '+room.name+suffix,exact:true})).toHaveAttribute('data-panorama-ready','true');}
 await tour.getByRole('group',{name:'Reviewed tour scenes'}).getByRole('button',{name:'Living / dining'+suffix,exact:true}).click();await tour.screenshot({path:evidenceDir+'/tour.png'});
 await tour.getByRole('navigation',{name:'Property views'}).getByRole('button',{name:'3D plan',exact:true}).click();const model=visitor.getByRole('dialog',{name:'Reviewed property model',exact:true});await expect(model.getByRole('status')).toContainText('Structural model loaded');if(furnished){await expect(model.locator('[data-furnishing-count]')).toHaveAttribute('data-furnishing-count','46');await model.getByRole('checkbox',{name:'Cutaway walls (show furnishings)'}).check();}await model.screenshot({path:evidenceDir+'/model.png'});
 await model.getByRole('navigation',{name:'Property views'}).getByRole('button',{name:'Floor plan',exact:true}).click();await expect(visitor.getByRole('dialog',{name:'Interactive property tour',exact:true})).toBeVisible();await visitor.getByRole('dialog').screenshot({path:evidenceDir+'/plan.png'});
 expect(errors).toEqual([]);s.validatedAt=new Date().toISOString();save();await visitorContext.close();console.log(JSON.stringify({publicUrl:s.publicUrl,rooms:5,walls:8,openings:10,validatedAt:s.validatedAt}));
});
