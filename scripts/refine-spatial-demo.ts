import {chromium,expect} from '@playwright/test';
import fs from 'node:fs';
import {login,apiRequest} from '../tests/support/browser';
const listingId='10000000-0000-4000-8000-000000002000',browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const agentContext=await browser.newContext(),agent=await agentContext.newPage();
 await login(agent,'agent','http://localhost:8089','/ops/listings');
 const state=(await (await agent.request.get('http://localhost:8089/api/v1/ops/listings/'+listingId+'/media')).json()).data.media;
 const demo=JSON.parse(fs.readFileSync('evidence/spatial-demo.json','utf8')),ground=state.find((row:any)=>row.id===demo.groundFloorId);
 const suffix=ground.metadata.spatial.name.replace('Reviewed ground ','');
 const upper=state.find((row:any)=>row.kind==='floor_plan'&&row.metadata.spatial?.name==='Upper floor '+suffix)||state.find((row:any)=>row.metadata.spatial?.name==='Upper floor (illustration)');
 if(!ground||!upper)throw new Error('Two approved sample floor plans are required');
 const mapped=new Set(state.flatMap((row:any)=>row.metadata.spatial?.rooms.map((room:any)=>room.sceneId)||[]));
 const living=state.filter((row:any)=>row.kind==='panorama'&&row.status==='approved'&&row.title.includes('Living')&&!mapped.has(row.id));
 const bedrooms=state.filter((row:any)=>row.kind==='panorama'&&row.status==='approved'&&row.title.includes('Bedroom')&&!mapped.has(row.id));
 if(living.length<2||bedrooms.length<2)throw new Error('Two distinct approved living and bedroom viewpoints are required');
 function room(id:string,label:string,sceneId:string,x:number,y:number,width:number,depth:number){return{id,label,sceneId,heightMetres:2.7,polygon:[{x:x/1200,y:y/900},{x:(x+width)/1200,y:y/900},{x:(x+width)/1200,y:(y+depth)/900},{x:x/1200,y:(y+depth)/900}],camera:{x:(x+width/2)/1200,y:(y+depth/2)/900,headingDegrees:0}};}
 const revisions:any[]=[];
 for(const [index,plan] of [ground,upper].entries()){
  const name=index?'Upper floor (illustration)':'Ground floor (illustration)';
  const spatial={name,level:index,widthMetres:10,depthMetres:8,elevationMetres:index*3,northDegrees:0,rooms:[room('living','Living / dining',living[index].id,80,490,1040,300),room('bedroom','Bedroom 1',bedrooms[index].id,80,140,420,350)]};
  const response=await apiRequest(agent,'/ops/property-media/'+plan.id,{title:name+' — interactive plan',position:0,version:plan.version,metadata:{caption:'Synthetic two-level example with a repeated schematic. Illustrative dimensions and panoramas; not a surveyed or scanned property. The 3D model contains only the supplied mapped rooms.',hotspots:[],spatial}},'PATCH');
  expect(response.ok()).toBe(true);revisions.push((await response.json()).data);
 }
 const moderatorContext=await browser.newContext(),moderator=await moderatorContext.newPage();
 await login(moderator,'moderator','http://localhost:8089','/ops/reviews');
 for(const revision of revisions){const response=await apiRequest(moderator,'/ops/property-media/'+revision.id+'/review',{decision:'approved',reason:'Verified synthetic SVG room bounds, matched panorama labels, and illustrative source disclosure',version:revision.version});expect(response.ok()).toBe(true);}
 await moderatorContext.close();await agentContext.close();
 console.log('Sample room bounds and labels corrected through authenticated authoring and independent moderation.');
}finally{await browser.close();}
