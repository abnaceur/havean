import type pg from 'pg';
import type {Actor} from '@haven/database';
import {event} from '@haven/database';
import {digitizationTourCreate,digitizationTourRecord,digitizationGeometryRevision,digitizationPanoramaCandidates} from '@haven/contracts';
import type {z} from 'zod';
import {fail,transaction} from '../../platform/core.js';
import {checkedWorkspace,requireDigitizationAgency} from './intakes.js';
import {cpuSourceFingerprint} from './execution-scope.js';
import {verifySmallDigitizationSource} from './source-validation.js';
import {requireTourPosition} from './tour-position.js';
type Input=z.infer<typeof digitizationTourCreate>;
function record(row:any,workspaceVersion:number){return digitizationTourRecord.parse({id:row.id,version:row.version,revision:row.revision,inputRevision:row.input_revision,workspaceVersion,graph:row.graph,reviewRequired:true,genuinePanoramaConfirmed:false});}
export async function tourScope(c:pg.PoolClient,a:Actor,engine:string,input:Input){
 await requireDigitizationAgency(c,a);const workspace=await checkedWorkspace(c,engine);
 if(workspace.state!=='active'||workspace.inputRevision!==input.inputRevision)fail(409,'The tour source revision changed. Reload before editing.','TOUR_INPUT_CHANGED');
 const manifest=(await c.query('SELECT source_set FROM property_input_revisions WHERE digitization_id=$1 AND revision=$2',[engine,input.inputRevision])).rows[0]?.source_set;
 if(!Array.isArray(manifest))fail(404,'Current panorama sources not found.');
 const ids=input.graph.nodes.flatMap(node=>node.tierArtifactIds),tiers=(await c.query("SELECT a.id,a.version,a.checksum,a.input_fingerprint,a.quality_report FROM artifacts a JOIN processing_stages s ON s.id=a.stage_id JOIN processing_runs r ON r.id=s.run_id WHERE a.id=ANY($3::uuid[]) AND a.digitization_id=$1 AND a.input_revision=$2 AND a.profile_id='private-panorama-candidate-v1' AND a.status='private' AND a.privacy_status IN('pending','passed') AND a.format='image/png' AND a.quality_report->>'kind'='panorama_candidate' AND s.stage_type='panorama_optimize' AND s.state='succeeded' AND r.state IN('awaiting_review','awaiting_input','failed','partially_ready')",[engine,input.inputRevision,ids])).rows;
 if(tiers.length!==ids.length)fail(404,'Current private panorama tiers not found.');
 const sources=new Map<string,any>();
 for(const node of input.graph.nodes){
  const rows=node.tierArtifactIds.map(id=>tiers.find(tier=>tier.id===id)),fingerprints=new Set(rows.map(row=>row.input_fingerprint));
  if(fingerprints.size!==1||new Set(rows.map(row=>row.quality_report.width)).size!==rows.length)fail(422,'A node must use distinct tiers of one panorama capture.','TOUR_NODE_INVALID');
  const matches=manifest.filter(source=>source.purpose==='panorama'&&cpuSourceFingerprint(engine,a.orgId!,input.inputRevision,'private-panorama-candidate-v1',source)===rows[0].input_fingerprint);
  if(matches.length!==1||rows.some(row=>row.quality_report.projection!=='equirectangular_candidate'||row.quality_report.genuinePanoramaConfirmed!==false||row.quality_report.reviewRequired!==true||row.quality_report.width!==2*row.quality_report.height))fail(422,'Exact panorama candidate lineage is required.','TOUR_NODE_INVALID');
  if(sources.has(matches[0].assetId))fail(422,'Each panorama capture belongs to one tour node.','TOUR_NODE_INVALID');
  sources.set(matches[0].assetId,matches[0]);
 }
 if(input.graph.geometryRevisionId){
  const parsed=digitizationGeometryRevision.safeParse((await c.query('SELECT geometry FROM geometry_revisions WHERE digitization_id=$1 AND input_revision=$2 ORDER BY revision DESC LIMIT 1',[engine,input.inputRevision])).rows[0]?.geometry);
  if(!parsed.success)fail(422,'Room links require a current v2 geometry revision.','TOUR_ROOM_INVALID');
  const geometry=parsed.data;for(const node of input.graph.nodes)requireTourPosition(geometry,node.roomId,node.planPosition);
  if(geometry.id!==input.graph.geometryRevisionId||input.graph.nodes.some(node=>node.roomId!==null&&!geometry.rooms.some(room=>room.id===node.roomId)))fail(422,'Room links must belong to the current geometry revision.','TOUR_ROOM_INVALID');
 }
 return {workspace,tiers:tiers.sort((a,b)=>a.id.localeCompare(b.id)),sources:[...sources.values()].sort((a,b)=>a.assetId.localeCompare(b.assetId))};
}
export async function verifyTourSources(a:Actor,engine:string,input:Input){
 const context=await transaction(a,c=>tourScope(c,a,engine,input));let total=0;
 for(const source of context.sources){
  total+=Number(source.bytes);if(total>200*1024*1024)fail(422,'This tour exceeds its bounded source-validation budget.','TOUR_SOURCE_BUDGET_EXCEEDED');
  const current=await verifySmallDigitizationSource(a,engine,source.assetId,source.assetVersion,input.inputRevision,'panorama');
  if(current.sha256!==source.sha256)fail(409,'A panorama source changed after optimization.','SOURCE_CONTENT_CHANGED');
 }
 return context;
}
export async function saveTour(c:pg.PoolClient,a:Actor,engine:string,input:Input,prepared:Awaited<ReturnType<typeof verifyTourSources>>){
 const fresh=await tourScope(c,a,engine,input);
 if(fresh.workspace.version!==input.workspaceVersion||JSON.stringify(fresh)!==JSON.stringify(prepared))fail(409,'The tour workspace changed. Reload before saving.','TOUR_VERSION_CHANGED');
 const previous=(await c.query('SELECT revision FROM tour_revisions WHERE digitization_id=$1 ORDER BY revision DESC LIMIT 1',[engine])).rows[0]?.revision??0;
 if(previous!==input.baseTourRevision)fail(409,'A newer tour revision exists. Reload before saving.','TOUR_VERSION_CHANGED');
 const row=(await c.query('INSERT INTO tour_revisions(digitization_id,organization_id,created_by,revision,input_revision,graph) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[engine,a.orgId,a.id,previous+1,input.inputRevision,JSON.stringify(input.graph)])).rows[0];
 await c.query('UPDATE property_digitizations SET version=version+1 WHERE id=$1',[engine]);await event(c,a,engine,'digitization.tour_saved',{tourRevisionId:row.id,inputRevision:input.inputRevision,revision:row.revision});return record(row,input.workspaceVersion+1);
}
export async function latestTour(c:pg.PoolClient,a:Actor,engine:string){await requireDigitizationAgency(c,a);const workspace=await checkedWorkspace(c,engine);const row=(await c.query('SELECT * FROM tour_revisions WHERE digitization_id=$1 AND input_revision=$2 ORDER BY revision DESC LIMIT 1',[engine,workspace.inputRevision])).rows[0];return row?record(row,workspace.version):null;}
export async function panoramaCandidates(c:pg.PoolClient,a:Actor,engine:string){
 await requireDigitizationAgency(c,a);const workspace=await checkedWorkspace(c,engine);
 if(!workspace.inputRevision)return [];
 const sources=(await c.query('SELECT source_set FROM property_input_revisions WHERE digitization_id=$1 AND revision=$2',[engine,workspace.inputRevision])).rows[0]?.source_set;
 if(!Array.isArray(sources))fail(404,'Current panorama sources not found.');
 const rows=(await c.query("SELECT a.id,a.version,a.stage_id,a.input_fingerprint,a.quality_report FROM artifacts a JOIN processing_stages s ON s.id=a.stage_id WHERE a.digitization_id=$1 AND a.input_revision=$2 AND a.profile_id='private-panorama-candidate-v1' AND a.status='private' AND a.privacy_status IN('pending','passed') AND a.quality_report->>'kind'='panorama_candidate' AND s.state='succeeded' ORDER BY a.created_at DESC,a.id",[engine,workspace.inputRevision])).rows;
 const groups=new Map<string,{captureId:string;stageId:string;inputRevision:number;tiers:Array<{artifactId:string;artifactVersion:number;width:number;height:number}>;reviewRequired:true;genuinePanoramaConfirmed:false}>();
 for(const row of rows){
  const source=sources.find(source=>source.purpose==='panorama'&&cpuSourceFingerprint(engine,a.orgId!,workspace.inputRevision,'private-panorama-candidate-v1',source)===row.input_fingerprint);
  if(!source||row.quality_report.genuinePanoramaConfirmed!==false||row.quality_report.reviewRequired!==true)continue;
  if(!groups.has(source.assetId))groups.set(source.assetId,{captureId:source.assetId,stageId:row.stage_id,inputRevision:workspace.inputRevision,tiers:[],reviewRequired:true,genuinePanoramaConfirmed:false});
  const group=groups.get(source.assetId)!;if(group.stageId!==row.stage_id)continue;
  group.tiers.push({artifactId:row.id,artifactVersion:row.version,width:row.quality_report.width,height:row.quality_report.height});
 }
 return digitizationPanoramaCandidates.parse([...groups.values()].map(({stageId:_stage,...group})=>({...group,tiers:group.tiers.sort((a,b)=>a.width-b.width)})));
}
