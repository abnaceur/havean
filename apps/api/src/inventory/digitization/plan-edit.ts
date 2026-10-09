import {digitizationGeometryRevision,type DigitizationGeometryRevision} from '@haven/contracts';
import {ringArea,roomTopologyError} from '@haven/contracts';
type Room=DigitizationGeometryRevision['rooms'][number];
type Point=Room['polygon'][number];
const equal=(a:Point,b:Point)=>Math.abs(a.x-b.x)<1e-8&&Math.abs(a.y-b.y)<1e-8;
function areaPreserved(before:number,after:number){if(Math.abs(before-after)>Math.max(1e-8,before*1e-8))throw Error('PLAN_EDIT_AREA_CHANGED');}
function writable(input:DigitizationGeometryRevision){const g=digitizationGeometryRevision.parse(input);if(g.unit!=='px'||g.scaleStatus!=='unscaled'||g.review.status!=='pending')throw Error('PLAN_EDIT_REQUIRES_UNSCALED_DRAFT');return g;}
/** Split along an explicitly selected vertex diagonal. Crossings, holes and
 * ambiguous/disconnected results require a separately traced boundary. */
export function splitPlanRoom(input:DigitizationGeometryRevision,roomId:string,first:number,last:number){
 const g=writable(input),room=g.rooms.find(r=>r.id===roomId);if(!room)throw Error('PLAN_ROOM_NOT_FOUND');
 const n=room.polygon.length;if(room.holes.length||!Number.isInteger(first)||!Number.isInteger(last)||first<0||last<0||first>=n||last>=n||first===last)throw Error('PLAN_SPLIT_INVALID');
 const [a,b]=[first,last].sort((x,y)=>x-y),left=room.polygon.slice(a,b+1),right=[...room.polygon.slice(b),...room.polygon.slice(0,a+1)];
 if(roomTopologyError(left)||roomTopologyError(right))throw Error('PLAN_SPLIT_INVALID');areaPreserved(ringArea(room.polygon),ringArea(left)+ringArea(right));
 const parts=[left,right].map((polygon,i)=>({...room,id:'room-'+crypto.randomUUID(),name:room.name.slice(0,76)+' '+(i+1),polygon,panoramaSceneId:null}));
 return digitizationGeometryRevision.parse({...g,rooms:[...g.rooms.filter(r=>r.id!==roomId),...parts]});
}
/** Merge rooms that share one complete boundary edge. Do not guess bridges,
 * discard holes, reconcile different source transforms or change floors. */
export function mergePlanRooms(input:DigitizationGeometryRevision,firstId:string,lastId:string,name:string){
 const g=writable(input),a=g.rooms.find(r=>r.id===firstId),b=g.rooms.find(r=>r.id===lastId);
 if(!a||!b||a.id===b.id||a.floorId!==b.floorId||a.holes.length||b.holes.length||JSON.stringify(a.source)!==JSON.stringify(b.source))throw Error('PLAN_MERGE_INVALID');
 const signed=(p:Point[])=>p.reduce((s,v,i)=>s+v.x*p[(i+1)%p.length].y-p[(i+1)%p.length].x*v.y,0),p=a.polygon,q=signed(a.polygon)*signed(b.polygon)<0?[...b.polygon].reverse():b.polygon;
 const matches:{i:number;j:number}[]=[];
 for(let i=0;i<p.length;i++)for(let j=0;j<q.length;j++)if(equal(p[i],q[(j+1)%q.length])&&equal(p[(i+1)%p.length],q[j]))matches.push({i,j});
 if(matches.length!==1)throw Error('PLAN_MERGE_SHARED_EDGE_REQUIRED');const {i,j}=matches[0];
 const path=(ring:Point[],edge:number)=>Array.from({length:ring.length},(_,k)=>ring[(edge+1+k)%ring.length]);
 const polygon=[...path(p,i),...path(q,j).slice(1,-1)];if(roomTopologyError(polygon))throw Error('PLAN_MERGE_INVALID');areaPreserved(ringArea(p)+ringArea(q),ringArea(polygon));
 return digitizationGeometryRevision.parse({...g,rooms:[...g.rooms.filter(r=>r.id!==a.id&&r.id!==b.id),{...a,id:'room-'+crypto.randomUUID(),name,polygon,panoramaSceneId:null}]});
}
export function addPlanFloor(input:DigitizationGeometryRevision,name:string){const g=writable(input);return digitizationGeometryRevision.parse({...g,floors:[...g.floors,{id:'floor-'+crypto.randomUUID(),name,elevation:'0',height:null,source:g.sources[0]}]});}
export function connectPlanFloors(input:DigitizationGeometryRevision,fromFloorId:string,toFloorId:string){const g=writable(input);if(g.stairs.some(s=>s.fromFloorId===fromFloorId&&s.toFloorId===toFloorId||s.fromFloorId===toFloorId&&s.toFloorId===fromFloorId))throw Error('PLAN_STAIR_ALREADY_EXISTS');return digitizationGeometryRevision.parse({...g,stairs:[...g.stairs,{id:'stair-'+crypto.randomUUID(),fromFloorId,toFloorId,source:g.sources[0]}]});}
