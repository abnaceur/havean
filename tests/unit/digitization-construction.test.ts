import {expect,it} from 'vitest';
import type {DigitizationGeometryRevision} from '../../packages/contracts/src/index';
import {constructionReport,applyConstructionEdit} from '../../apps/api/src/inventory/digitization/construction';
import {applySuppliedGeometryDimensions} from '../../apps/api/src/inventory/digitization/geometry-dimensions';
import {renderStructuralGlb} from '../../apps/api/src/inventory/digitization/structural-glb';
const actor='10000000-0000-4000-8000-000000000001',source={kind:'manual' as const,actorId:actor,note:'Authored property construction fixture; not a measurement'};
const geometry:DigitizationGeometryRevision={schemaVersion:2,id:actor,organizationId:actor,targetId:actor,revision:1,parentRevision:null,coordinateSystem:'right-handed-z-up',unit:'m',scaleStatus:'estimated',sourceAssets:[],sources:[source],scaleAnchors:[{id:'scale',points:[{x:0,y:0},{x:5,y:0}],distanceMetres:'5',source,reviewerId:actor,status:'confirmed'}],floors:[{id:'floor',name:'Ground',elevation:'0',height:{amount:'3',basis:'supplied_unverified',source},source}],rooms:[{id:'room',floorId:'floor',name:'Room',type:'living',polygon:[{x:0,y:0},{x:5,y:0},{x:5,y:5},{x:0,y:5}],holes:[],panoramaSceneId:null,source,areaBasis:'geometry_room_net'}],walls:[{id:'wall',floorId:'floor',start:{x:0,y:0},end:{x:5,y:0},thickness:'0.2',height:null,confirmed:true,source}],openings:[{id:'door',wallId:'wall',offset:'1',width:'1',type:'door',sill:'0',height:'2',source,confirmed:true}],stairs:[],furnishings:[{id:'cabinet',roomId:'room',label:'Tall cabinet',kind:'cabinet',position:{x:3,y:3},bottom:'0',rotationDegrees:0,width:'1',depth:'1',height:'2.5',color:'#765432',basis:'supplied_unverified',source}],review:{status:'pending',actorId:null}};
const command={version:1,geometryRevisionId:actor,note:source.note,suppliedLayoutConfirmed:true as const};
it('reports construction inputs and exports an immutable corrected metric model without changing scale or approval',()=>{
 expect(constructionReport(null).previewReady).toBe(false);expect(constructionReport(geometry).previewReady).toBe(true);
 const before=renderStructuralGlb(geometry).sha256;
 const child=applyConstructionEdit(geometry,actor,{...command,operation:{kind:'opening',openingId:'door',offset:'2',width:'1',sill:'0',height:'2'}});
 expect(child.revision).toBe(2);expect(child.scaleAnchors).toEqual(geometry.scaleAnchors);expect(child.review.status).toBe('pending');expect(geometry.openings[0].offset).toBe('1');expect(renderStructuralGlb(child).sha256).not.toBe(before);
 expect(()=>applyConstructionEdit(child,actor,{...command,operation:{kind:'opening',openingId:'door',offset:'2',width:'1',sill:'0',height:'2'}})).toThrow();
 const transom={...geometry,openings:[...geometry.openings,{...geometry.openings[0],id:'transom',type:'window' as const,sill:'2.1',height:'0.5'}]};
 expect(constructionReport(transom).previewReady).toBe(true);
 expect(constructionReport({...transom,openings:[geometry.openings[0],{...transom.openings[1],sill:'1.8'}]}).previewReady).toBe(false);
 const missing={...geometry,floors:[{...geometry.floors[0],height:null}],openings:[{...geometry.openings[0],sill:null}]};
 expect(constructionReport(missing).issues.map(i=>i.code)).toContain('HEIGHT_REQUIRED');expect(constructionReport(missing).previewReady).toBe(false);
});
it('refuses room edits that strand furniture and wall/opening edits that cannot fit; lowering ceilings checks retained objects',()=>{
 expect(()=>applyConstructionEdit(geometry,actor,{...command,operation:{kind:'room',roomId:'room',name:'Room',polygon:[{x:0,y:0},{x:2,y:0},{x:2,y:2},{x:0,y:2}]}})).toThrow();
 expect(()=>applyConstructionEdit(geometry,actor,{...command,operation:{kind:'wall',wallId:'wall',start:{x:0,y:0},end:{x:1,y:0},thickness:'0.2'}})).toThrow();
 expect(()=>applyConstructionEdit(geometry,actor,{...command,operation:{kind:'opening',openingId:'door',offset:'1',width:'1',sill:'2',height:'2'}})).toThrow();
 expect(()=>applySuppliedGeometryDimensions(geometry,actor,{version:1,geometryRevisionId:actor,floorId:'floor',heightMetres:'2.2',note:source.note,suppliedDimensionsConfirmed:true,openings:[]})).toThrow('The supplied object extends above its room ceiling.');
});
