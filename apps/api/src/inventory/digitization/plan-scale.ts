import {digitizationGeometryRevision,type DigitizationGeometryRevision} from '@haven/contracts';

/** Uniform calibration of one unscaled 2D floor. This prepares a new draft;
 * the API save port must check actor/target/evidence and the expected parent.
 * Heights/floor registration require separate evidence, never pixel conversion.
 */
export function calibratePlanTrace(input:DigitizationGeometryRevision,anchorId:string,reviewerId:string){
 const geometry=digitizationGeometryRevision.parse(input);
 if(geometry.unit!=='px'||geometry.scaleStatus!=='unscaled')throw Error('PLAN_SCALE_ALREADY_SET');
 if(geometry.floors.length!==1||geometry.floors.some(floor=>Number(floor.elevation)!==0||floor.height!==null)||geometry.walls.some(wall=>wall.height!==null)||geometry.openings.some(opening=>opening.height!==null||opening.sill!==null))throw Error('PLAN_SCALE_REQUIRES_SEPARATE_VERTICAL_EVIDENCE');
 const anchor=geometry.scaleAnchors.find(item=>item.id===anchorId);if(!anchor)throw Error('PLAN_SCALE_ANCHOR_NOT_FOUND');
 const ratio=Number(anchor.distanceMetres)/Math.hypot(anchor.points[1].x-anchor.points[0].x,anchor.points[1].y-anchor.points[0].y);
 if(!Number.isFinite(ratio)||ratio<=0)throw Error('PLAN_SCALE_INVALID');
 const point=(value:{x:number;y:number})=>({x:value.x*ratio,y:value.y*ratio});
 const dimension=(value:string)=>{const scaled=Number(value)*ratio;if(!Number.isFinite(scaled)||scaled<0||scaled>=1e9)throw Error('PLAN_SCALE_INVALID');return scaled.toFixed(8).replace(/\.?0+$/,'');};
 const source=(value:DigitizationGeometryRevision['sources'][number])=>{
  if(value.kind==='manual')return value;
  const matrix=value.originalToModel;if(matrix[6]!==0||matrix[7]!==0||matrix[8]!==1||Math.abs(matrix[0]*matrix[4]-matrix[1]*matrix[3])<1e-12)throw Error('PLAN_SOURCE_TRANSFORM_UNSUPPORTED');
  return {...value,originalToModel:matrix.map((value,index)=>index<6?value*ratio:value)};
 };
 return digitizationGeometryRevision.parse({...geometry,id:crypto.randomUUID(),revision:geometry.revision+1,parentRevision:geometry.revision,unit:'m',scaleStatus:'estimated',review:{status:'pending',actorId:null},
  sources:geometry.sources.map(source),
  rooms:geometry.rooms.map(room=>({...room,polygon:room.polygon.map(point),holes:room.holes.map(hole=>hole.map(point)),source:source(room.source)})),
  walls:geometry.walls.map(wall=>({...wall,start:point(wall.start),end:point(wall.end),thickness:dimension(wall.thickness),source:source(wall.source)})),
  openings:geometry.openings.map(opening=>({...opening,offset:dimension(opening.offset),width:dimension(opening.width),source:source(opening.source)})),
  floors:geometry.floors.map(floor=>({...floor,source:source(floor.source)})),stairs:geometry.stairs.map(stair=>({...stair,source:source(stair.source)})),
  scaleAnchors:geometry.scaleAnchors.map(item=>({...item,points:item.points.map(point),source:source(item.source),...(item.id===anchorId?{status:'confirmed',reviewerId}:{})}))});
}
