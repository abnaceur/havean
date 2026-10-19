import {expect,it} from 'vitest';
import type {DigitizationGeometryRevision} from '../../packages/contracts/src/index';
import {applySuppliedGeometryDimensions} from '../../apps/api/src/inventory/digitization/geometry-dimensions';
import {renderStructuralGlb} from '../../apps/api/src/inventory/digitization/structural-glb';
const actor='10000000-0000-4000-8000-000000000001',peer='10000000-0000-4000-8000-000000000002',asset='10000000-0000-4000-8000-000000000003',source={kind:'asset' as const,assetId:asset,page:1,originalToModel:[1,0,0,0,1,0,0,0,1]};
const geometry:DigitizationGeometryRevision={schemaVersion:2,id:asset,organizationId:actor,targetId:actor,revision:1,parentRevision:null,coordinateSystem:'right-handed-z-up',unit:'m',scaleStatus:'estimated',sourceAssets:[asset],sources:[source],scaleAnchors:[{id:'reference',points:[{x:0,y:0},{x:10,y:0}],distanceMetres:'10',source:{kind:'manual',actorId:actor,note:'Synthetic reference length'},reviewerId:peer,status:'confirmed'}],floors:[{id:'ground',name:'Ground',elevation:'0',height:null,source}],rooms:[],walls:[{id:'wall',floorId:'ground',start:{x:0,y:0},end:{x:10,y:0},thickness:'0.2',height:null,source,confirmed:true}],openings:[{id:'door',wallId:'wall',offset:'2',width:'1',type:'door',sill:null,height:null,source,confirmed:true}],stairs:[],review:{status:'pending',actorId:null}};
const command={version:1,geometryRevisionId:asset,floorId:'ground',heightMetres:'3.00',note:'Explicit user supplied fixture dimensions; not measured.',suppliedDimensionsConfirmed:true as const,openings:[{openingId:'door',heightMetres:'2.00',sillMetres:'0'}]};
it('unknown dimensions block GLB; explicit entries retain source XY and separate supplied/unverified provenance',()=>{
 expect(()=>renderStructuralGlb(geometry)).toThrow('STRUCTURAL_HEIGHT_REQUIRED');
 const child=applySuppliedGeometryDimensions(geometry,actor,command);
 expect(child.revision).toBe(2);expect(child.parentRevision).toBe(1);expect(child.review).toEqual({status:'pending',actorId:null});
 expect(child.floors[0].height).toEqual({amount:'3.00',basis:'supplied_unverified',source:{kind:'manual',actorId:actor,note:command.note}});
 expect(child.walls).toEqual(geometry.walls);expect(child.openings[0].source).toEqual(source);expect(child.openings[0].verticalSource).toEqual({kind:'manual',actorId:actor,note:command.note});
 expect(geometry.floors[0].height).toBeNull();expect(geometry.openings[0].height).toBeNull();expect(renderStructuralGlb(child).privacyReview).toBe('pending');
});
it('omitted opening fields stay unknown and duplicate/wrong/out-of-wall dimensions refuse the child',()=>{
 const partial=applySuppliedGeometryDimensions(geometry,actor,{...command,openings:[]});expect(partial.openings[0].height).toBeNull();expect(partial.openings[0].sill).toBeNull();expect(()=>renderStructuralGlb(partial)).toThrow('STRUCTURAL_OPENING_HEIGHT_REQUIRED');
 for(const openings of [[command.openings[0],command.openings[0]],[{...command.openings[0],openingId:'missing'}],[{...command.openings[0],sillMetres:'2'}]])expect(()=>applySuppliedGeometryDimensions(geometry,actor,{...command,openings})).toThrow();
 expect(()=>applySuppliedGeometryDimensions(geometry,actor,{...command,heightMetres:''})).toThrow();
 expect(()=>applySuppliedGeometryDimensions({...geometry,unit:'px',scaleStatus:'unscaled',scaleAnchors:[]},actor,command)).toThrow();
});
