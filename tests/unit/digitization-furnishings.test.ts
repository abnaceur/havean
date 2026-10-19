import {expect,it} from 'vitest';
import {digitizationGeometryRevision} from '../../packages/contracts/src/digitization-geometry';
import {applySuppliedGeometryFurnishings} from '../../apps/api/src/inventory/digitization/geometry-furnishings';
import {prepareStructuralPublicDerivative} from '../../apps/api/src/inventory/digitization/structural-projection';
const actor='10000000-0000-4000-8000-000000000001',id='10000000-0000-4000-8000-000000000002',source={kind:'manual',actorId:actor,note:'Authored functional fixture; not measured.'};
const geometry=digitizationGeometryRevision.parse({schemaVersion:2,id,organizationId:actor,targetId:actor,revision:1,parentRevision:null,coordinateSystem:'right-handed-z-up',unit:'m',scaleStatus:'estimated',sourceAssets:[],sources:[source],scaleAnchors:[{id:'scale',points:[{x:0,y:0},{x:6,y:0}],distanceMetres:'6',source,reviewerId:actor,status:'confirmed'}],floors:[{id:'floor',name:'Floor',elevation:'0',height:{amount:'2.8',basis:'supplied_unverified',source},source}],rooms:[{id:'room',floorId:'floor',name:'Room',type:'living',polygon:[{x:0,y:0},{x:6,y:0},{x:6,y:6},{x:0,y:6}],holes:[],panoramaSceneId:null,source,areaBasis:'geometry_room_net'}],walls:[],openings:[],stairs:[],review:{status:'pending',actorId:null}});
const item={id:'sofa',roomId:'room',label:'Private sofa note',kind:'sofa' as const,position:{x:2,y:2},bottom:'0',rotationDegrees:0,width:'2.4',depth:'0.9',height:'0.9',color:'#789067'};
const command={version:1,geometryRevisionId:id,note:'Authored dimensions, not recovered furniture.',suppliedObjectsConfirmed:true as const,furnishings:[item]};
it('saves real object meshes as an immutable supplied child and strips private object metadata from the reviewed derivative',()=>{
 const bare=prepareStructuralPublicDerivative(geometry),child=applySuppliedGeometryFurnishings(geometry,actor,command),result=prepareStructuralPublicDerivative(child),json=JSON.parse(result.body.subarray(20,20+result.body.readUInt32LE(12)).toString());
 expect(child.id).not.toBe(geometry.id);expect(child.parentRevision).toBe(1);expect(child.review).toEqual({status:'pending',actorId:null});expect(child.furnishings?.[0].source.actorId).toBe(actor);expect(child.furnishings?.[0].basis).toBe('supplied_unverified');expect(geometry.furnishings).toBeUndefined();
 expect(json.asset.extras.furnishingCount).toBe(1);expect(json.meshes.length).toBeGreaterThan(5);expect(json.nodes.some((n:any)=>n.extras.kind==='furnishing')).toBe(true);expect(JSON.stringify(json)).not.toContain(actor);expect(JSON.stringify(json)).not.toContain(item.label);expect(result.sha256).not.toBe(bare.sha256);expect(prepareStructuralPublicDerivative(geometry).sha256).toBe(bare.sha256);
});
it('refuses stale geometry, objects outside the linked room, missing rooms and oversized or duplicate objects',()=>{
 expect(()=>applySuppliedGeometryFurnishings(geometry,actor,{...command,geometryRevisionId:actor})).toThrow();
 for(const patch of [{roomId:'missing'},{position:{x:.1,y:2}},{height:'3'},{bottom:'2'},{width:'25'}])expect(()=>applySuppliedGeometryFurnishings(geometry,actor,{...command,furnishings:[{...item,...patch}]})).toThrow();
 expect(()=>applySuppliedGeometryFurnishings(geometry,actor,{...command,furnishings:[item,item]})).toThrow();
});
