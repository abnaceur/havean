import type pg from 'pg';
import {event,type Actor} from '@haven/database';
import {digitizationGeometryDimensions,digitizationGeometryRevision,type DigitizationGeometryRevision} from '@haven/contracts';
import type {z} from 'zod';
import {fail} from '../../platform/core.js';
import {checkedWorkspace,requireDigitizationAgency} from './intakes.js';
import {constructionReport} from './construction.js';
import {readGeometryDraft} from './geometry-drafts.js';
type Dimensions=z.infer<typeof digitizationGeometryDimensions>;
/** Explicit user inputs stay supplied/unverified. Source XY and previous
 * immutable observations are retained; empty opening dimensions stay unknown. */
export function applySuppliedGeometryDimensions(parent:DigitizationGeometryRevision,actorId:string,input:Dimensions){
 const x=digitizationGeometryDimensions.parse(input),g=digitizationGeometryRevision.parse(parent);
 if(g.id!==x.geometryRevisionId)fail(409,'Select the current immutable geometry.','GEOMETRY_REVISION_CONFLICT');
 if(g.unit!=='m'||!['estimated','measured'].includes(g.scaleStatus)||g.review.status!=='pending')fail(409,'Supply dimensions for a current metric draft.','GEOMETRY_DIMENSION_WORKFLOW_REQUIRED');
 if(!g.floors.some(f=>f.id===x.floorId))fail(422,'Select a floor in this geometry.','PLAN_FLOOR_NOT_FOUND');
 if(new Set(x.openings.map(o=>o.openingId)).size!==x.openings.length)fail(422,'Select each opening once.','GEOMETRY_DIMENSIONS_INVALID');
 const source={kind:'manual' as const,actorId,note:x.note};
 for(const supplied of x.openings){
  const opening=g.openings.find(o=>o.id===supplied.openingId),wall=g.walls.find(w=>w.id===opening?.wallId);
  if(!opening?.confirmed||!wall||wall.floorId!==x.floorId)fail(422,'Vertical dimensions need a confirmed opening on this floor.','GEOMETRY_DIMENSIONS_INVALID');
  const height=Number(wall.height?.amount??x.heightMetres);
  if(Number(supplied.sillMetres)+Number(supplied.heightMetres)>height+1e-8)fail(422,'Opening height and sill must fit the declared wall.','GEOMETRY_DIMENSIONS_INVALID');
 }
 const next={...g,id:crypto.randomUUID(),revision:g.revision+1,parentRevision:g.revision,sources:g.sources.some(s=>JSON.stringify(s)===JSON.stringify(source))?g.sources:[...g.sources,source],floors:g.floors.map(f=>f.id===x.floorId?{...f,height:{amount:x.heightMetres,basis:'supplied_unverified' as const,source}}:f),openings:g.openings.map(o=>{const supplied=x.openings.find(s=>s.openingId===o.id);return supplied?{...o,height:supplied.heightMetres,sill:supplied.sillMetres,verticalSource:source}:o;}),review:{status:'pending' as const,actorId:null}};
 const validated=digitizationGeometryRevision.parse(next),invalid=constructionReport(validated).issues.find(i=>['OPENING_OUTSIDE_WALL','OBJECT_ABOVE_CEILING'].includes(i.code));
 if(invalid)fail(422,invalid.message,invalid.code);
 return validated;
}
export async function saveSuppliedGeometryDimensions(c:pg.PoolClient,a:Actor,engine:string,input:Dimensions){
 await requireDigitizationAgency(c,a);const workspace=await checkedWorkspace(c,engine),x=digitizationGeometryDimensions.parse(input);
 if(workspace.state!=='active'||workspace.version!==x.version)fail(409,'The workspace changed. Reload before supplying dimensions.','VERSION_CONFLICT');
 const draft=await readGeometryDraft(c,a,engine);if(!draft||draft.inputRevision!==workspace.inputRevision)fail(409,'The source geometry changed.','GEOMETRY_REVISION_CONFLICT');
 const geometry=applySuppliedGeometryDimensions(draft.geometry,a.id,x);
 const parent=(await c.query('SELECT id,source_artifact_id,source_selection FROM geometry_revisions WHERE id=$1 AND digitization_id=$2',[draft.geometry.id,engine])).rows[0];
 if(!parent)fail(409,'The geometry parent is unavailable.');
 await c.query(`INSERT INTO geometry_revisions(id,digitization_id,organization_id,created_by,revision,parent_id,schema_version,geometry,scale_status,input_revision,source_artifact_id,source_selection) VALUES($1,$2,$3,$4,$5,$6,2,$7,$8,$9,$10,$11)`,[geometry.id,engine,a.orgId,a.id,geometry.revision,parent.id,geometry,geometry.scaleStatus,workspace.inputRevision,parent.source_artifact_id,parent.source_selection]);
 await c.query('UPDATE property_digitizations SET version=version+1 WHERE id=$1',[engine]);
 await c.query("INSERT INTO digitization_events(digitization_id,organization_id,created_by,kind,state) VALUES($1,$2,$3,'digitization.geometry_saved','draft')",[engine,a.orgId,a.id]);
 await event(c,a,engine,'digitization.geometry_saved',{geometryRevisionId:geometry.id,revision:geometry.revision,inputRevision:workspace.inputRevision});
 const saved=await readGeometryDraft(c,a,engine);if(!saved)fail(409,'Source authority changed while saving dimensions.','SOURCE_ACCESS_CHANGED');return saved;
}
