import {expect,it} from 'vitest';
import {digitizationGeometryRevision,ringArea,type DigitizationGeometryRevision} from '../../packages/contracts/src/index';
import {splitPlanRoom,mergePlanRooms,addPlanFloor,connectPlanFloors} from '../../apps/api/src/inventory/digitization/plan-edit';
const uuid='10000000-0000-4000-8000-000000000001',source={kind:'asset' as const,assetId:uuid,page:1,originalToModel:[1,0,0,0,1,0,0,0,1]};
const geometry:DigitizationGeometryRevision={schemaVersion:2,id:uuid,organizationId:uuid,targetId:uuid,revision:1,parentRevision:null,coordinateSystem:'right-handed-z-up',unit:'px',scaleStatus:'unscaled',sourceAssets:[uuid],sources:[source],scaleAnchors:[],floors:[{id:'ground',name:'Ground',elevation:'0',height:null,source}],rooms:[{id:'room',floorId:'ground',name:'Room',type:'living',polygon:[{x:0,y:0},{x:12,y:0},{x:12,y:8},{x:0,y:8}],holes:[],panoramaSceneId:null,source,areaBasis:'geometry_room_net'}],walls:[],openings:[],stairs:[],review:{status:'pending',actorId:null}};
it('split/merge preserve independently expected polygon area, provenance and the unchanged parent',()=>{
 const before=JSON.stringify(geometry),split=splitPlanRoom(geometry,'room',0,2);expect(split.rooms).toHaveLength(2);expect(split.rooms.map(r=>ringArea(r.polygon))).toEqual([48,48]);expect(split.rooms.every(r=>r.source.assetId===uuid&&r.floorId==='ground')).toBe(true);expect(digitizationGeometryRevision.safeParse(split).success).toBe(true);
 const merged=mergePlanRooms(split,split.rooms[0].id,split.rooms[1].id,'Combined');expect(merged.rooms).toHaveLength(1);expect(ringArea(merged.rooms[0].polygon)).toBe(96);expect(merged.rooms[0].name).toBe('Combined');expect(JSON.stringify(geometry)).toBe(before);
 expect(()=>splitPlanRoom(geometry,'room',0,1)).toThrow('PLAN_SPLIT_INVALID');expect(()=>mergePlanRooms(geometry,'room','room','Bad')).toThrow('PLAN_MERGE_INVALID');
});
it('reject concave outside diagonals and preserve holes rather than silently dropping them',()=>{
 const concave={...geometry,rooms:[{...geometry.rooms[0],polygon:[{x:0,y:0},{x:4,y:0},{x:4,y:1},{x:1,y:1},{x:1,y:4},{x:0,y:4}]}]};expect(()=>splitPlanRoom(concave,'room',2,4)).toThrow();
 const holed={...geometry,rooms:[{...geometry.rooms[0],holes:[[{x:1,y:1},{x:2,y:1},{x:2,y:2},{x:1,y:2}]]}]};expect(()=>splitPlanRoom(holed,'room',0,2)).toThrow('PLAN_SPLIT_INVALID');
});
it('a stair connects the selected existing floor IDs without inventing heights or elevations',()=>{
 const two=addPlanFloor(geometry,'Upper'),upper=two.floors[1].id,result=connectPlanFloors(two,'ground',upper);expect(result.stairs[0]).toMatchObject({fromFloorId:'ground',toFloorId:upper,source});expect(result.floors.every(f=>f.height===null&&f.elevation==='0')).toBe(true);expect(()=>connectPlanFloors(two,'ground','ground')).toThrow();expect(()=>connectPlanFloors(two,'ground','missing')).toThrow();expect(()=>connectPlanFloors(result,upper,'ground')).toThrow('PLAN_STAIR_ALREADY_EXISTS');
});
