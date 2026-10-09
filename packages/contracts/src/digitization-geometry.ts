import {z} from 'zod';
import {roomTopologyError} from './digitization-topology';
export const geometryDecimal=z.string().regex(/^-?(?:0|[1-9]\d{0,8})(?:\.\d{1,8})?$/);
const positive=geometryDecimal.refine(v=>Number(v)>0,'Use a positive dimension');
const coordinate=z.number().finite().min(-1e6).max(1e6);
export const geometryPoint=z.strictObject({x:coordinate,y:coordinate});
export const geometryScaleStatus=z.enum(['unscaled','estimated','measured','legacy_supplied_unverified']);
export const geometrySource=z.discriminatedUnion('kind',[
 z.strictObject({kind:z.literal('asset'),assetId:z.uuid(),page:z.number().int().min(1).max(50).optional(),originalToModel:z.array(z.number().finite()).length(9)}),
 z.strictObject({kind:z.literal('manual'),actorId:z.uuid(),note:z.string().min(2).max(500)})
]);
const id=z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const ring=z.array(geometryPoint).min(3).max(128);
const height=z.strictObject({amount:positive,basis:z.enum(['measured','supplied_unverified','illustrative_assumption']),source:geometrySource});
const anchor=z.strictObject({id,points:z.tuple([geometryPoint,geometryPoint]).describe('Endpoints in this revision’s canonical XY coordinates and unit; source-image endpoints must first use the recorded source transform.'),distanceMetres:positive,source:geometrySource,reviewerId:z.uuid(),status:z.enum(['pending','confirmed'])}).refine(a=>a.points[0].x!==a.points[1].x||a.points[0].y!==a.points[1].y,'Scale anchor points must differ');
export const digitizationGeometryRevision=z.strictObject({
 schemaVersion:z.literal(2),id:z.uuid(),organizationId:z.uuid(),targetId:z.uuid(),revision:z.number().int().positive(),parentRevision:z.number().int().positive().nullable(),
 coordinateSystem:z.literal('right-handed-z-up'),unit:z.enum(['m','px']),scaleStatus:geometryScaleStatus,
 sourceAssets:z.array(z.uuid()).max(100),sources:z.array(geometrySource).min(1).max(100),scaleAnchors:z.array(anchor).max(10),
 floors:z.array(z.strictObject({id,name:z.string().min(1).max(80),elevation:geometryDecimal,height:height.nullable(),source:geometrySource})).min(1).max(20),
 rooms:z.array(z.strictObject({id,floorId:id,name:z.string().min(1).max(80),type:z.string().min(1).max(50),polygon:ring,holes:z.array(ring).max(10),panoramaSceneId:z.uuid().nullable(),source:geometrySource,areaBasis:z.literal('geometry_room_net')})).max(200),
 walls:z.array(z.strictObject({id,floorId:id,start:geometryPoint,end:geometryPoint,thickness:positive,height:height.nullable(),source:geometrySource,confirmed:z.boolean()})).max(2000),
 openings:z.array(z.strictObject({id,wallId:id,offset:geometryDecimal,width:positive,type:z.enum(['door','window']),sill:geometryDecimal.nullable(),height:positive.nullable(),source:geometrySource,confirmed:z.boolean()})).max(2000),
 stairs:z.array(z.strictObject({id,fromFloorId:id,toFloorId:id,source:geometrySource})).max(100),
 review:z.strictObject({status:z.enum(['pending','confirmed','rejected']),actorId:z.uuid().nullable()})
}).superRefine((g,ctx)=>{
 const issue=(path:(string|number)[],message:string)=>ctx.addIssue({code:'custom',path,message});
 const objects=[...g.floors,...g.rooms,...g.walls,...g.openings,...g.stairs,...g.scaleAnchors];
 if(new Set(objects.map(o=>o.id)).size!==objects.length)issue(['id'],'Geometry IDs must be unique');
 const floors=new Set(g.floors.map(f=>f.id)),walls=new Map(g.walls.map(w=>[w.id,w]));
 for(const [index,room] of g.rooms.entries()){
  if(!floors.has(room.floorId))issue(['rooms',index,'floorId'],'Unknown floor');
  const topologyError=roomTopologyError(room.polygon,room.holes);if(topologyError)issue(['rooms',index,'polygon'],topologyError);
 }
 for(const [index,wall] of g.walls.entries()){
  if(!floors.has(wall.floorId))issue(['walls',index,'floorId'],'Unknown floor');
  if(wall.start.x===wall.end.x&&wall.start.y===wall.end.y)issue(['walls',index],'Wall endpoints must differ');
 }
 for(const [index,opening] of g.openings.entries()){
  const wall=walls.get(opening.wallId);
  if(!wall)issue(['openings',index,'wallId'],'Unknown wall');
  else if(Number(opening.offset)<0||Number(opening.offset)+Number(opening.width)>Math.hypot(wall.end.x-wall.start.x,wall.end.y-wall.start.y)+1e-8)issue(['openings',index],'Opening is outside its wall');
  if(opening.sill!==null&&Number(opening.sill)<0)issue(['openings',index,'sill'],'Sill must be nonnegative');
 }
 for(const [index,stair] of g.stairs.entries())if(!floors.has(stair.fromFloorId)||!floors.has(stair.toFloorId)||stair.fromFloorId===stair.toFloorId)issue(['stairs',index],'Stairs require two distinct existing floors');
 if(g.scaleStatus==='unscaled'&&g.unit!=='px')issue(['unit'],'Unscaled geometry uses pixels');
 if(['estimated','measured'].includes(g.scaleStatus)&&(g.unit!=='m'||!g.scaleAnchors.some(a=>a.status==='confirmed')))issue(['scaleStatus'],'Metric geometry requires confirmed scale evidence');
 // Confirming a distance cannot silently rescale or stretch the stored model.
 // Pending observations can disagree while the reviewer resolves a conflict.
 if(g.unit==='m'&&['estimated','measured'].includes(g.scaleStatus))for(const [index,a] of g.scaleAnchors.entries())if(a.status==='confirmed'){
  const modelDistance=Math.hypot(a.points[1].x-a.points[0].x,a.points[1].y-a.points[0].y),declaredDistance=Number(a.distanceMetres);
  if(Math.abs(modelDistance-declaredDistance)>Math.max(1e-8,declaredDistance*1e-6))issue(['scaleAnchors',index,'distanceMetres'],'Confirmed scale distance conflicts with canonical metre coordinates; correct the transform or anchor');
 }
 if(g.review.status!=='pending'&&!g.review.actorId)issue(['review'],'Reviewed geometry requires an actor');
});
export type DigitizationGeometryRevision=z.infer<typeof digitizationGeometryRevision>;

// Optional engine-owned metadata envelope; legacy floorLayout semantics stay unchanged.
export const digitizationGeometryMetadataEnvelope=z.strictObject({geometrySchemaVersion:z.literal(2),scaleStatus:geometryScaleStatus,geometryRevisionId:z.uuid()});
