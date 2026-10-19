import type pg from 'pg';
import {event,type Actor} from '@haven/database';
import {digitizationGeometryFurnishings,digitizationGeometryRevision,type DigitizationGeometryRevision} from '@haven/contracts';
import type {z} from 'zod';
import {fail} from '../../platform/core.js';
import {checkedWorkspace,requireDigitizationAgency} from './intakes.js';
import {requireTourPosition} from './tour-position.js';
import {readGeometryDraft} from './geometry-drafts.js';
type Furnishings=z.infer<typeof digitizationGeometryFurnishings>;
/** Authored objects are immutable supplied inputs, never recovered geometry. */
export function applySuppliedGeometryFurnishings(parent:DigitizationGeometryRevision,actorId:string,input:Furnishings){
 const x=digitizationGeometryFurnishings.parse(input),g=digitizationGeometryRevision.parse(parent);
 if(g.id!==x.geometryRevisionId)fail(409,'Select the current immutable geometry.','GEOMETRY_REVISION_CONFLICT');
 if(g.unit!=='m'||!['estimated','measured'].includes(g.scaleStatus)||g.review.status!=='pending')fail(409,'Furnish a current metric draft.','GEOMETRY_FURNISHING_WORKFLOW_REQUIRED');
 const source={kind:'manual' as const,actorId,note:x.note};
 for(const item of x.furnishings){
  const room=g.rooms.find(room=>room.id===item.roomId),floor=g.floors.find(f=>f.id===room?.floorId);
  if(!room||!floor?.height)fail(422,'Select a room with a supplied floor height.','FURNISHING_ROOM_REQUIRED');
  requireTourPosition(g,item.roomId,{floorId:floor.id,...item.position,confirmed:true});
  if(Number(item.bottom)+Number(item.height)>Number(floor.height.amount))fail(422,'Object height exceeds the room ceiling.','FURNISHING_OUTSIDE_ROOM');
  const angle=item.rotationDegrees*Math.PI/180;
  for(const dx of [-1,1])for(const dy of [-1,1]){
   const x=dx*Number(item.width)/2,y=dy*Number(item.depth)/2;
   requireTourPosition(g,item.roomId,{floorId:floor.id,x:item.position.x+x*Math.cos(angle)-y*Math.sin(angle),y:item.position.y+x*Math.sin(angle)+y*Math.cos(angle),confirmed:true});
  }
 }
 return digitizationGeometryRevision.parse({...g,id:crypto.randomUUID(),revision:g.revision+1,parentRevision:g.revision,furnishings:x.furnishings.map(item=>({...item,basis:'supplied_unverified',source})),review:{status:'pending',actorId:null}});
}
export async function saveSuppliedGeometryFurnishings(c:pg.PoolClient,a:Actor,engine:string,input:Furnishings){
 await requireDigitizationAgency(c,a);const workspace=await checkedWorkspace(c,engine),x=digitizationGeometryFurnishings.parse(input);
 if(workspace.state!=='active'||workspace.version!==x.version)fail(409,'The workspace changed. Reload before saving furnishings.','VERSION_CONFLICT');
 const draft=await readGeometryDraft(c,a,engine);if(!draft||draft.inputRevision!==workspace.inputRevision)fail(409,'The source geometry changed.','GEOMETRY_REVISION_CONFLICT');
 const geometry=applySuppliedGeometryFurnishings(draft.geometry,a.id,x);
 const parent=(await c.query('SELECT id,source_artifact_id,source_selection FROM geometry_revisions WHERE id=$1 AND digitization_id=$2',[draft.geometry.id,engine])).rows[0];
 if(!parent)fail(409,'The geometry parent is unavailable.');
 await c.query(`INSERT INTO geometry_revisions(id,digitization_id,organization_id,created_by,revision,parent_id,schema_version,geometry,scale_status,input_revision,source_artifact_id,source_selection) VALUES($1,$2,$3,$4,$5,$6,2,$7,$8,$9,$10,$11)`,[geometry.id,engine,a.orgId,a.id,geometry.revision,parent.id,geometry,geometry.scaleStatus,workspace.inputRevision,parent.source_artifact_id,parent.source_selection]);
 await c.query('UPDATE property_digitizations SET version=version+1 WHERE id=$1',[engine]);
 await c.query("INSERT INTO digitization_events(digitization_id,organization_id,created_by,kind,state) VALUES($1,$2,$3,'digitization.geometry_saved','draft')",[engine,a.orgId,a.id]);
 await event(c,a,engine,'digitization.geometry_saved',{geometryRevisionId:geometry.id,revision:geometry.revision,inputRevision:workspace.inputRevision});
 const saved=await readGeometryDraft(c,a,engine);if(!saved)fail(409,'Source authority changed while saving furnishings.','SOURCE_ACCESS_CHANGED');return saved;
}
