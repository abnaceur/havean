import type pg from 'pg';
import {event,type Actor} from '@haven/database';
import {digitizationConstructionReport,digitizationConstructionEdit,digitizationGeometryRevision,type DigitizationGeometryRevision} from '@haven/contracts';
import type {z} from 'zod';
import {fail} from '../../platform/core.js';
import {checkedWorkspace,requireDigitizationAgency} from './intakes.js';
import {readGeometryDraft} from './geometry-drafts.js';
import {applySuppliedGeometryFurnishings} from './geometry-furnishings.js';

/** Construction facts come from the current source-bound geometry, never guessed rooms. */
export function constructionReport(g:DigitizationGeometryRevision|null){
 const issues:z.infer<typeof digitizationConstructionReport>['issues']=[];
 let blocked=false;
 const issue=(code:string,message:string,entityId:string|null=null,severity:'blocking'|'review'='blocking')=>{if(severity==='blocking')blocked=true;if(issues.length<5000)issues.push({code,message,entityId,severity});};
 if(!g)issue('PLAN_REQUIRED','Upload and trace the property floor plan before constructing its architectural model.');
 else{
  if(g.unit!=='m'||!['estimated','measured'].includes(g.scaleStatus))issue('SCALE_REQUIRED','Supply a checked reference length to scale the plan.');
  if(!g.rooms.length)issue('ROOMS_REQUIRED','Trace the rooms shown in the property plan.');
  if(!g.walls.length)issue('WALLS_REQUIRED','Trace the property walls; room polygons alone do not create walls.');
  for(const floor of g.floors)if(!g.rooms.some(r=>r.floorId===floor.id))issue('FLOOR_EMPTY','This floor has no traced rooms.',floor.id,'review');
  for(const wall of g.walls){
   const floor=g.floors.find(f=>f.id===wall.floorId),height=wall.height??floor?.height;
   if(!height)issue('HEIGHT_REQUIRED','Supply the height for this wall or its floor.',wall.id);
   if(!wall.confirmed)issue('WALL_UNCONFIRMED','Check this traced wall against the source plan.',wall.id,'review');
   const openings=g.openings.filter(o=>o.wallId===wall.id&&o.confirmed).sort((a,b)=>Number(a.offset)-Number(b.offset));
   for(const opening of openings){
    if(opening.height===null||opening.sill===null)issue('OPENING_HEIGHT_REQUIRED','Supply both the opening height and sill height.',opening.id);
    else if(height&&Number(opening.sill)+Number(opening.height)>Number(height.amount)+1e-8)issue('OPENING_OUTSIDE_WALL','The opening exceeds the wall height.',opening.id);
    const overlap=openings.some(other=>other!==opening&&other.height!==null&&other.sill!==null&&opening.height!==null&&opening.sill!==null&&Math.min(Number(other.offset)+Number(other.width),Number(opening.offset)+Number(opening.width))-Math.max(Number(other.offset),Number(opening.offset))>1e-8&&Math.min(Number(other.sill)+Number(other.height),Number(opening.sill)+Number(opening.height))-Math.max(Number(other.sill),Number(opening.sill))>1e-8);
    if(overlap)issue('OPENINGS_OVERLAP','Two openings overlap on this wall. Correct their positions or dimensions.',opening.id);
   }
  }
  if(g.unit==='m')for(const room of g.rooms){
   const walls=g.walls.filter(w=>w.floorId===room.floorId);
   const gap=room.polygon.some((a,index)=>{
    const b=room.polygon[(index+1)%room.polygon.length],length=Math.hypot(b.x-a.x,b.y-a.y),ux=(b.x-a.x)/length,uy=(b.y-a.y)/length;
    const intervals=walls.flatMap(w=>{const tolerance=Number(w.thickness)/2+.01,perp=(p:{x:number;y:number})=>Math.abs((p.x-a.x)*uy-(p.y-a.y)*ux);if(perp(w.start)>tolerance||perp(w.end)>tolerance)return [];const projection=(p:{x:number;y:number})=>(p.x-a.x)*ux+(p.y-a.y)*uy,first=projection(w.start),last=projection(w.end);return [[Math.max(0,Math.min(first,last)),Math.min(length,Math.max(first,last))]];}).filter(([start,end])=>end>start).sort((x,y)=>x[0]-y[0]);
    let reached=0;for(const [start,end] of intervals){if(start-reached>.2)return true;reached=Math.max(reached,end);}return length-reached>.2;
   });
   if(gap)issue('ROOM_BOUNDARY_UNTRACED','Part of this room boundary has no traced wall. Check whether it is open space or a missing wall; no wall is inferred.',room.id,'review');
  }
  for(const opening of g.openings)if(!opening.confirmed)issue('OPENING_UNCONFIRMED','Confirm this opening on the source before it is cut into the wall.',opening.id,'review');
  for(const item of g.furnishings??[]){const room=g.rooms.find(r=>r.id===item.roomId),floor=g.floors.find(f=>f.id===room?.floorId);if(floor?.height&&Number(item.bottom)+Number(item.height)>Number(floor.height.amount)+1e-8)issue('OBJECT_ABOVE_CEILING','The supplied object extends above its room ceiling.',item.id);}
  if(!g.furnishings?.length)issue('NO_OBJECTS','No furniture or fixtures have been supplied. The architectural model will contain the traced structure only.',null,'review');
  if(g.stairs.length)issue('STAIR_GEOMETRY_UNKNOWN','Floor connections are recorded, but stair shape and dimensions have not been supplied.',null,'review');
  issue('INDEPENDENT_REVIEW','Supplied geometry and object placements require independent review before publication.',null,'review');
 }
 return digitizationConstructionReport.parse({geometryRevisionId:g?.id??null,previewReady:!blocked,scaleStatus:g?.scaleStatus??null,counts:{floors:g?.floors.length??0,rooms:g?.rooms.length??0,walls:g?.walls.length??0,openings:g?.openings.length??0,furnishings:g?.furnishings?.length??0},issues,publicationReady:false});
}
export async function readConstructionReport(c:pg.PoolClient,a:Actor,engine:string){return constructionReport((await readGeometryDraft(c,a,engine))?.geometry??null);}
type Edit=z.infer<typeof digitizationConstructionEdit>;
export function applyConstructionEdit(parent:DigitizationGeometryRevision,actorId:string,input:Edit){
 const x=digitizationConstructionEdit.parse(input),g=digitizationGeometryRevision.parse(parent),o=x.operation;
 if(g.id!==x.geometryRevisionId)fail(409,'The geometry changed. Reload this revision.','GEOMETRY_REVISION_CONFLICT');
 if(g.unit!=='m'||!['estimated','measured'].includes(g.scaleStatus)||g.review.status!=='pending')fail(409,'Edit a current private metric draft.','GEOMETRY_CONSTRUCTION_WORKFLOW_REQUIRED');
 const source={kind:'manual' as const,actorId,note:x.note};
 const next={...g,id:crypto.randomUUID(),revision:g.revision+1,parentRevision:g.revision,review:{status:'pending' as const,actorId:null}};
 if(o.kind==='wall'){
  if(!g.walls.some(w=>w.id===o.wallId))fail(422,'Select an existing wall.','CONSTRUCTION_ENTITY_REQUIRED');
  next.walls=g.walls.map(w=>w.id===o.wallId?{...w,start:o.start,end:o.end,thickness:o.thickness,source}:w);
 }else if(o.kind==='room'){
  if(!g.rooms.some(r=>r.id===o.roomId))fail(422,'Select an existing room.','CONSTRUCTION_ENTITY_REQUIRED');
  next.rooms=g.rooms.map(r=>r.id===o.roomId?{...r,name:o.name,polygon:o.polygon,source}:r);
 }else{
  if(!g.openings.some(v=>v.id===o.openingId))fail(422,'Select an existing opening.','CONSTRUCTION_ENTITY_REQUIRED');
  next.openings=g.openings.map(v=>v.id===o.openingId?{...v,offset:o.offset,width:o.width,sill:o.sill,height:o.height,source,verticalSource:source}:v);
 }
 const parsed=digitizationGeometryRevision.safeParse(next);
 if(!parsed.success)fail(422,'Keep valid room boundaries, wall openings and the existing scale references.','CONSTRUCTION_GEOMETRY_INVALID');
 const invalid=constructionReport(parsed.data).issues.find(i=>['OPENING_OUTSIDE_WALL','OPENINGS_OVERLAP','OBJECT_ABOVE_CEILING'].includes(i.code));
 if(invalid)fail(422,invalid.message,invalid.code);
 if(parsed.data.furnishings?.length)applySuppliedGeometryFurnishings(parsed.data,actorId,{version:x.version,geometryRevisionId:parsed.data.id,note:x.note,suppliedObjectsConfirmed:true,furnishings:parsed.data.furnishings.map(({source:_source,basis:_basis,...item})=>item)});
 return parsed.data;
}
export async function saveConstructionEdit(c:pg.PoolClient,a:Actor,engine:string,input:Edit){
 await requireDigitizationAgency(c,a);const w=await checkedWorkspace(c,engine),x=digitizationConstructionEdit.parse(input);
 if(w.state!=='active'||w.version!==x.version)fail(409,'The workspace changed. Reload before editing.','VERSION_CONFLICT');
 const draft=await readGeometryDraft(c,a,engine);if(!draft||draft.inputRevision!==w.inputRevision)fail(409,'The source geometry changed.','GEOMETRY_REVISION_CONFLICT');
 const geometry=applyConstructionEdit(draft.geometry,a.id,x),parent=(await c.query('SELECT id,source_artifact_id,source_selection FROM geometry_revisions WHERE id=$1 AND digitization_id=$2',[draft.geometry.id,engine])).rows[0];
 if(!parent)fail(409,'The geometry parent is unavailable.');
 await c.query('INSERT INTO geometry_revisions(id,digitization_id,organization_id,created_by,revision,parent_id,schema_version,geometry,scale_status,input_revision,source_artifact_id,source_selection) VALUES($1,$2,$3,$4,$5,$6,2,$7,$8,$9,$10,$11)',[geometry.id,engine,a.orgId,a.id,geometry.revision,parent.id,geometry,geometry.scaleStatus,w.inputRevision,parent.source_artifact_id,parent.source_selection]);
 await c.query('UPDATE property_digitizations SET version=version+1 WHERE id=$1',[engine]);
 await c.query("INSERT INTO digitization_events(digitization_id,organization_id,created_by,kind,state) VALUES($1,$2,$3,'digitization.geometry_saved','draft')",[engine,a.orgId,a.id]);
 await event(c,a,engine,'digitization.geometry_saved',{geometryRevisionId:geometry.id,revision:geometry.revision,inputRevision:w.inputRevision});
 return readGeometryDraft(c,a,engine);
}
