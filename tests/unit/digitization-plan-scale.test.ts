import {expect,it} from 'vitest';
import type {DigitizationGeometryRevision} from '../../packages/contracts/src/index';
import {digitizationGeometryRevision} from '../../packages/contracts/src/digitization-geometry';
import {calibratePlanTrace} from '../../apps/api/src/inventory/digitization/plan-scale';
import {renderPlanSvg} from '../../apps/api/src/inventory/digitization/plan-render';
const uuid='10000000-0000-4000-8000-000000000001',source={kind:'asset' as const,assetId:uuid,originalToModel:[2,0,10,0,-2,90,0,0,1]},manual={kind:'manual' as const,actorId:uuid,note:'Synthetic independently supplied reference length'};
const geometry:DigitizationGeometryRevision={schemaVersion:2,id:uuid,organizationId:uuid,targetId:uuid,revision:1,parentRevision:null,coordinateSystem:'right-handed-z-up',unit:'px',scaleStatus:'unscaled',sourceAssets:[uuid],sources:[source],scaleAnchors:[{id:'reference',points:[{x:0,y:0},{x:100,y:0}],distanceMetres:'10',source:manual,reviewerId:uuid,status:'pending'},{id:'check',points:[{x:0,y:0},{x:0,y:100}],distanceMetres:'12',source:manual,reviewerId:uuid,status:'pending'}],floors:[{id:'floor',name:'Ground',elevation:'0',height:null,source}],rooms:[{id:'room',floorId:'floor',name:'Room',type:'living',polygon:[{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}],holes:[],panoramaSceneId:null,source,areaBasis:'geometry_room_net'}],walls:[{id:'wall',floorId:'floor',start:{x:0,y:0},end:{x:100,y:0},thickness:'5',height:null,source,confirmed:false}],openings:[{id:'door',wallId:'wall',offset:'20',width:'10',type:'door',sill:null,height:null,source,confirmed:false}],stairs:[],review:{status:'pending',actorId:null}};
it('known 10-metre reference uniformly calibrates actual SVG area, openings and overlay while preserving the unscaled parent/unknown heights',()=>{
 const before=JSON.stringify(geometry);expect(renderPlanSvg(geometry,'floor')).not.toContain('m²');
 const scaled=calibratePlanTrace(geometry,'reference',uuid);
 expect(JSON.stringify(geometry)).toBe(before);expect(scaled).toMatchObject({revision:2,parentRevision:1,unit:'m',scaleStatus:'estimated',review:{status:'pending',actorId:null}});
 expect(scaled.rooms[0].polygon[2]).toEqual({x:10,y:10});expect(scaled.floors[0].height).toBeNull();expect(scaled.walls[0]).toMatchObject({thickness:'0.5',confirmed:false});expect(scaled.openings[0]).toMatchObject({offset:'2',width:'1',height:null,confirmed:false});
 expect(scaled.sources[0]).toMatchObject({originalToModel:[0.2,0,1,0,-0.2,9,0,0,1]});expect(renderPlanSvg(scaled,'floor')).toContain('100.00 m² net; estimated');
 expect(scaled.scaleAnchors[1].status).toBe('pending');expect(digitizationGeometryRevision.safeParse({...scaled,scaleAnchors:scaled.scaleAnchors.map(item=>({...item,status:'confirmed'}))}).success).toBe(false);
});
it('calibration refuses implicit vertical/multifloor assumptions, invalid source transforms, unknown anchors and repeat scaling',()=>{
 expect(()=>calibratePlanTrace({...geometry,floors:[{...geometry.floors[0],elevation:'3'}]},'reference',uuid)).toThrow('PLAN_SCALE_REQUIRES_SEPARATE_VERTICAL_EVIDENCE');
 expect(()=>calibratePlanTrace({...geometry,floors:[geometry.floors[0],{...geometry.floors[0],id:'upper'}]},'reference',uuid)).toThrow('PLAN_SCALE_REQUIRES_SEPARATE_VERTICAL_EVIDENCE');
 expect(()=>calibratePlanTrace(geometry,'missing',uuid)).toThrow('PLAN_SCALE_ANCHOR_NOT_FOUND');
 expect(()=>calibratePlanTrace({...geometry,sources:[{...source,originalToModel:[0,0,0,0,0,0,0,0,1]}]},'reference',uuid)).toThrow('PLAN_SOURCE_TRANSFORM_UNSUPPORTED');
 expect(()=>calibratePlanTrace(calibratePlanTrace(geometry,'reference',uuid),'reference',uuid)).toThrow('PLAN_SCALE_ALREADY_SET');
});
