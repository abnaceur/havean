import type pg from 'pg';
import {event,type Actor} from '@haven/database';
import {digitizationSceneRegistrationCreate,digitizationSceneRegistration,digitizationGeometryRevision,type DigitizationSceneRegistrationCreate,type DigitizationGeometryRevision} from '@haven/contracts';
import {fail} from '../../platform/core.js';
import {checkedWorkspace,requireDigitizationAgency} from './intakes.js';
type Point=[number,number,number];
const subtract=(a:Point,b:Point):Point=>a.map((v,i)=>v-b[i]) as Point;
const dot=(a:Point,b:Point)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const norm=(a:Point)=>Math.hypot(...a);
const cross=(a:Point,b:Point):Point=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function basis(points:Point[]){
 const first=subtract(points[1],points[0]),length=norm(first);
 if(length<1e-6)fail(422,'Choose distinct scene and plan anchors.','SCENE_ANCHORS_DEGENERATE');
 const x=first.map(v=>v/length) as Point,second=subtract(points[2],points[0]),along=dot(x,second),orthogonal=second.map((v,i)=>v-along*x[i]) as Point;
 if(norm(orthogonal)<Math.max(1e-6,norm(second)*1e-4))fail(422,'Choose three non-collinear anchors.','SCENE_ANCHORS_DEGENERATE');
 const y=orthogonal.map(v=>v/norm(orthogonal)) as Point;
 return {axes:[x,y,cross(x,y)],length};
}
/** Fit one proper similarity transform. User observations remain estimates;
 * neither a good residual nor a manually calibrated plan approves navigation. */
export function estimateSceneRegistration(value:DigitizationSceneRegistrationCreate){
 const x=digitizationSceneRegistrationCreate.parse(value),scene=x.anchors.map(a=>a.scene),plan=x.anchors.map(a=>a.plan),source=basis(scene),target=basis(plan);
 const scale=target.length/source.length;
 if(!Number.isFinite(scale)||scale<.000001||scale>1000000)fail(422,'The registration scale is outside the supported range.','SCENE_SCALE_INVALID');
 const rotation=Array.from({length:3},(_,row)=>Array.from({length:3},(_,column)=>target.axes.reduce((sum,axis,index)=>sum+axis[row]*source.axes[index][column],0)));
 const transform=(point:Point)=>rotation.map(row=>scale*dot(row as Point,point)) as Point;
 const rotated=transform(scene[0]),translation=plan[0].map((v,i)=>v-rotated[i]) as Point;
 const converted=(point:Point)=>transform(point).map((v,i)=>v+translation[i]) as Point;
 const residual=Math.max(...scene.map((point,i)=>norm(subtract(converted(point),plan[i]))));
 const span=Math.max(...plan.map(point=>norm(subtract(point,plan[0]))));
 if(!Number.isFinite(residual)||residual>Math.max(.02,span*.02))fail(422,'The supplied anchors disagree. Verify each observed correspondence.','SCENE_ANCHORS_INCONSISTENT');
 const matrix=rotation.flatMap((row,i)=>[...row.map(v=>v*scale),translation[i]]).concat([0,0,0,1]);
 if(matrix.some(v=>!Number.isFinite(v)||Math.abs(v)>1e9))fail(422,'The transform is outside the supported range.','SCENE_TRANSFORM_INVALID');
 return {sceneToPlan:matrix,metresPerSceneUnit:scale.toFixed(8).replace(/\.?0+$/,''),maximumResidualMetres:residual,
  scaleStatus:'estimated' as const,reviewStatus:'pending' as const,metricMeasurementsAvailable:false as const,planNavigationAvailable:false as const,publiclyServed:false as const};
}
export function sceneRegistrationRecord(row:any,version:number){const v=row.registration;return digitizationSceneRegistration.parse({id:row.id,workspaceVersion:version,inputRevision:row.input_revision,sceneArtifactId:row.scene_artifact_id,geometryRevisionId:row.geometry_revision_id,floorId:row.floor_id,anchors:row.anchors,cameraAnchors:v.cameraAnchors,sceneToPlan:v.sceneToPlan,maximumResidualMetres:v.maximumResidualMetres,scaleStatus:v.scaleStatus,reviewStatus:v.reviewStatus,metricMeasurementsAvailable:v.metricMeasurementsAvailable,planNavigationAvailable:v.planNavigationAvailable,publiclyServed:v.publiclyServed,metresPerSceneUnit:String(row.metres_per_scene_unit)});}
function inside(point:Point,ring:{x:number;y:number}[]){
 let odd=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j],cross=(b.x-a.x)*(point[1]-a.y)-(b.y-a.y)*(point[0]-a.x);
  if(Math.abs(cross)<=1e-8&&point[0]>=Math.min(a.x,b.x)-1e-8&&point[0]<=Math.max(a.x,b.x)+1e-8&&point[1]>=Math.min(a.y,b.y)-1e-8&&point[1]<=Math.max(a.y,b.y)+1e-8)return false;
  if((a.y>point[1])!==(b.y>point[1])&&point[0]<(b.x-a.x)*(point[1]-a.y)/(b.y-a.y)+a.x)odd=!odd;
 }return odd;
}
/** Camera observations remain private proposals. A fitted transform does not
 * establish a safe path, correct scale or independent navigation approval. */
export function projectSceneCameraAnchors(input:DigitizationSceneRegistrationCreate,geometry:DigitizationGeometryRevision){
 const x=digitizationSceneRegistrationCreate.parse(input),registration=estimateSceneRegistration(x),g=digitizationGeometryRevision.parse(geometry),floor=g.floors.find(f=>f.id===x.floorId);
 if(!floor||g.unit!=='m'||!['estimated','measured'].includes(g.scaleStatus))fail(422,'A current metric floor is required.','SCENE_METRIC_PLAN_REQUIRED');
 return x.cameraAnchors.map(camera=>{
  const m=registration.sceneToPlan,planPosition=[0,1,2].map(row=>m[row*4]*camera.scene[0]+m[row*4+1]*camera.scene[1]+m[row*4+2]*camera.scene[2]+m[row*4+3]) as Point;
  const room=g.rooms.find(room=>room.id===camera.roomId&&room.floorId===floor.id);
  // Hole boundaries are excluded along with the hole interior.
  if(!room||!inside(planPosition,room.polygon)||room.holes.some(hole=>!insideOutsideHole(planPosition,hole)))fail(422,'Place each camera strictly inside its selected room, outside excluded areas.','SCENE_CAMERA_ROOM_INVALID');
  if(planPosition[2]<Number(floor.elevation)||floor.height&&planPosition[2]>Number(floor.elevation)+Number(floor.height.amount))fail(422,'The camera height is outside the selected floor.','SCENE_CAMERA_HEIGHT_INVALID');
  if(planPosition.some(v=>!Number.isFinite(v)||Math.abs(v)>1e6))fail(422,'The camera transform is outside the supported range.','SCENE_TRANSFORM_INVALID');
  return {...camera,planPosition};
 });
}
function insideOutsideHole(point:Point,ring:{x:number;y:number}[]){
 if(inside(point,ring))return false;
 return !ring.some((a,i)=>{const b=ring[(i+1)%ring.length];return Math.abs((b.x-a.x)*(point[1]-a.y)-(b.y-a.y)*(point[0]-a.x))<=1e-8&&point[0]>=Math.min(a.x,b.x)-1e-8&&point[0]<=Math.max(a.x,b.x)+1e-8&&point[1]>=Math.min(a.y,b.y)-1e-8&&point[1]<=Math.max(a.y,b.y)+1e-8;});
}
export async function readSceneRegistrations(c:pg.PoolClient,a:Actor,engine:string){
 await requireDigitizationAgency(c,a);const w=await checkedWorkspace(c,engine);
 return (await c.query(`SELECT r.* FROM digitization_scene_registrations r JOIN artifacts ar ON ar.id=r.scene_artifact_id WHERE r.digitization_id=$1 AND r.input_revision=$2 AND ar.status='private' ORDER BY r.workspace_version DESC,r.id LIMIT 100`,[engine,w.inputRevision])).rows.map(row=>sceneRegistrationRecord(row,w.version));
}
export async function saveSceneRegistration(c:pg.PoolClient,a:Actor,engine:string,value:DigitizationSceneRegistrationCreate){
 await requireDigitizationAgency(c,a);const w=await checkedWorkspace(c,engine),x=digitizationSceneRegistrationCreate.parse(value);
 if(w.state!=='active')fail(409,'The workspace no longer accepts registrations.','WORKFLOW_CONFLICT');
 if(w.version!==x.version||w.inputRevision!==x.inputRevision)fail(409,'The source or workspace changed.','INPUT_REVISION_CONFLICT');
 if(!(await c.query("SELECT digitization_revision_access($1,$2,'document_processing') allowed",[engine,x.inputRevision])).rows[0].allowed)fail(403,'Current source processing authority is required.','SOURCE_ACCESS_CHANGED');
 const scene=(await c.query(`SELECT ar.id FROM artifacts ar JOIN processing_stages s ON s.id=ar.stage_id WHERE ar.id=$1 AND ar.digitization_id=$2 AND ar.input_revision=$3 AND ar.status='private' AND (ar.quality_report->>'kind'='splat_scene' OR ar.quality_report->>'kind'='splat_viewer_tier' AND ar.quality_report->>'encoding'='splat32-wxyz-v1') AND ar.format IN('application/x-ply','application/octet-stream') AND s.state='succeeded' AND s.stage_type IN('splat_train','scene_export')`,[x.sceneArtifactId,engine,x.inputRevision])).rows[0];
 if(!scene)fail(404,'A current validated private scene is required.','SCENE_SOURCE_REQUIRED');
 const row=(await c.query('SELECT id,geometry,input_revision FROM geometry_revisions WHERE digitization_id=$1 ORDER BY revision DESC LIMIT 1',[engine])).rows[0];
 if(!row||row.id!==x.geometryRevisionId||row.input_revision!==x.inputRevision)fail(409,'Choose the current source-linked geometry.','GEOMETRY_REVISION_CONFLICT');
 const geometry=digitizationGeometryRevision.parse(row.geometry),floor=geometry.floors.find(f=>f.id===x.floorId);
 if(geometry.unit!=='m'||!['estimated','measured'].includes(geometry.scaleStatus)||!floor)fail(422,'A metric plan and an explicit floor are required.','SCENE_METRIC_PLAN_REQUIRED');
 if(x.anchors.some(anchor=>Math.abs(anchor.plan[2]-Number(floor.elevation))>1e-6))fail(422,'Plan anchors must belong to the selected floor plane.','SCENE_FLOOR_ANCHORS_REQUIRED');
 if((await c.query('SELECT count(*)::int n FROM digitization_scene_registrations WHERE digitization_id=$1',[engine])).rows[0].n>=1000)fail(429,'Private registration capacity reached.');
 const registration={...estimateSceneRegistration(x),cameraAnchors:projectSceneCameraAnchors(x,geometry)};
 const saved=(await c.query(`INSERT INTO digitization_scene_registrations(digitization_id,organization_id,created_by,workspace_version,input_revision,scene_artifact_id,geometry_revision_id,floor_id,anchors,metres_per_scene_unit,registration,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,[engine,a.orgId,a.id,w.version,w.inputRevision,x.sceneArtifactId,x.geometryRevisionId,x.floorId,JSON.stringify(x.anchors),registration.metresPerSceneUnit,registration,x.note])).rows[0];
 const changed=(await c.query('UPDATE property_digitizations SET version=version+1 WHERE id=$1 RETURNING version',[engine])).rows[0];
 await event(c,a,engine,'digitization.scene_registration_saved',{registrationId:saved.id,inputRevision:w.inputRevision,geometryRevisionId:x.geometryRevisionId});
 return sceneRegistrationRecord(saved,changed.version);
}
