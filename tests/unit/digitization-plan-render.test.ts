import {expect,it} from 'vitest';
import {createRequire} from 'node:module';
const sharp=createRequire(new URL('../../apps/api/package.json',import.meta.url))('sharp');
import type {DigitizationGeometryRevision} from '../../packages/contracts/src/index';
import {renderPlanSvg,renderPlanPng} from '../../apps/api/src/inventory/digitization/plan-render';
const source={kind:'manual' as const,actorId:'10000000-0000-4000-8000-000000000001',note:'Synthetic authored test geometry'};
const polygon=[{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}];
const geometry:DigitizationGeometryRevision={schemaVersion:2,id:source.actorId,organizationId:source.actorId,targetId:source.actorId,revision:1,parentRevision:null,coordinateSystem:'right-handed-z-up',unit:'px',scaleStatus:'unscaled',sourceAssets:[],sources:[source],scaleAnchors:[],floors:[{id:'ground',name:'Ground',elevation:'0',height:null,source}],rooms:[{id:'living',floorId:'ground',name:'Living <script>alert(1)</script>',type:'living',polygon,holes:[[{x:2,y:2},{x:4,y:2},{x:4,y:4},{x:2,y:4}]],panoramaSceneId:null,source,areaBasis:'geometry_room_net'}],walls:[{id:'south',floorId:'ground',start:{x:0,y:0},end:{x:10,y:0},thickness:'0.2',height:null,source,confirmed:true}],openings:[{id:'door',wallId:'south',offset:'2',width:'2',type:'door',sill:null,height:null,source,confirmed:true}],stairs:[],review:{status:'pending',actorId:null}};
it('renders deterministic topology with canonical XY projection, holes, approved openings and escaped labels',()=>{
 const svg=renderPlanSvg(geometry,'ground');expect(svg).toBe(renderPlanSvg(geometry,'ground'));
 expect(svg).toContain('fill-rule="evenodd"');expect(svg).toContain('M 0 0 L 10 0 L 10 -10 L 0 -10 Z');
 expect(svg).toContain('x1="0" y1="0" x2="2" y2="0"');expect(svg).toContain('x1="4" y1="0" x2="10" y2="0"');
 expect(svg).not.toContain('<script>');expect(svg).toContain('&lt;script&gt;');expect(svg).not.toContain('href=');expect(svg).not.toContain('m²');expect(svg).toContain('Unscaled trace');expect(svg).toContain('Draft');
 const unconfirmed=renderPlanSvg({...geometry,openings:[{...geometry.openings[0],confirmed:false}]},'ground');expect(unconfirmed).toContain('x1="0" y1="0" x2="10" y2="0"');
});
it('labels geometry net area only after scale evidence, preserving estimated and legacy limitations',()=>{
 const scaled={...geometry,unit:'m' as const,scaleStatus:'estimated' as const,scaleAnchors:[{id:'anchor',points:[{x:0,y:0},{x:10,y:0}] as [{x:number;y:number},{x:number;y:number}],distanceMetres:'10',source,reviewerId:source.actorId,status:'confirmed' as const}]};
 expect(renderPlanSvg(scaled,'ground')).toContain('96.00 m² net; estimated');
 const legacy=renderPlanSvg({...geometry,unit:'m',scaleStatus:'legacy_supplied_unverified'},'ground');expect(legacy).toContain('Supplied dimensions; unverified');expect(legacy).not.toContain('m²');
});
it('renders actual bounded PNG pixels with white holes and filled rooms; invalid floor and raster budget fail',async()=>{
 const output=await renderPlanPng(geometry,'ground',512),decoded=await sharp(output).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 expect(decoded.info.width).toBeLessThanOrEqual(512);expect(decoded.info.height).toBeLessThanOrEqual(512);
 const color=(x:number,y:number)=>{const px=Math.floor((x+.4)/10.8*decoded.info.width),py=Math.floor((11.15-y)/11.55*decoded.info.height),offset=(py*decoded.info.width+px)*4;return [...decoded.data.subarray(offset,offset+4)];};
 expect(color(3,3)).toEqual([255,255,255,255]);expect(color(1,1)).toEqual([236,243,239,255]);
 expect(()=>renderPlanSvg(geometry,'missing')).toThrow('PLAN_FLOOR_NOT_FOUND');await expect(renderPlanPng(geometry,'ground',4096)).rejects.toThrow('PLAN_RASTER_BUDGET_INVALID');
});

it('places concave-room labels inside a triangulated room rather than its bounding box or a hole',()=>{
 const concave=[{x:0,y:0},{x:6,y:0},{x:6,y:1},{x:1,y:1},{x:1,y:5},{x:6,y:5},{x:6,y:6},{x:0,y:6}];
 const svg=renderPlanSvg({...geometry,rooms:[{...geometry.rooms[0],polygon:concave,holes:[]}]},'ground');
 const coordinates=/data-room-label="living" x="([^"]+)" y="([^"]+)"/.exec(svg)!;
 const x=Number(coordinates[1]),y=-Number(coordinates[2]);expect(x<1||y<1||y>5).toBe(true);
});
