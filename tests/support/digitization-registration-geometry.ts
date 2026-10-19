import type {Actor} from '../../packages/database/src/index';
import {transaction} from '../../packages/database/src/index';
import {digitizationGeometryRevision} from '../../packages/contracts/src/index';
import {readPlanPageSelection} from '../../apps/api/src/inventory/digitization/plan-selection';
import {checkedWorkspace} from '../../apps/api/src/inventory/digitization/intakes';
import {saveSceneRegistration} from '../../apps/api/src/inventory/digitization/scene-registration';
/** Authored synthetic plan/scene linkage only, never real reconstruction or
 * independently measured property evidence. Uses owned isolated test fixtures. */
export async function authoredRegistrationFixture(actor:Actor,fixture:any){
 const {engineId,artifactId,rasterArtifactId,sourceAssetId}=fixture;
 const selection=await readPlanPageSelection(actor,engineId,rasterArtifactId,0);
 const geometry=await transaction(actor,async c=>{
  const w=await checkedWorkspace(c,engineId),source={...selection.source,originalToModel:selection.source.originalToModel.map((v,i)=>i<6?v*.01:v)};
  const g=digitizationGeometryRevision.parse({schemaVersion:2,id:crypto.randomUUID(),organizationId:actor.orgId,targetId:w.target.id,revision:1,parentRevision:null,coordinateSystem:'right-handed-z-up',unit:'m',scaleStatus:'estimated',sourceAssets:[sourceAssetId],sources:[source],scaleAnchors:[{id:'scale',points:[{x:0,y:0},{x:2,y:0}],distanceMetres:'2',source,reviewerId:actor.id,status:'confirmed'}],floors:[{id:'ground',name:'Ground',elevation:'0',height:{amount:'3',basis:'supplied_unverified',source},source}],rooms:[{id:'room',floorId:'ground',name:'Room',type:'living',polygon:[{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}],holes:[[{x:3,y:3},{x:4,y:3},{x:4,y:4},{x:3,y:4}]],panoramaSceneId:null,source,areaBasis:'geometry_room_net'}],walls:[],openings:[],stairs:[],review:{status:'pending',actorId:null}});
  await c.query(`INSERT INTO geometry_revisions(id,digitization_id,organization_id,created_by,revision,schema_version,geometry,scale_status,input_revision,source_artifact_id,source_selection) VALUES($1,$2,$3,$4,1,2,$5,'estimated',1,$6,$7)`,[g.id,engineId,actor.orgId,actor.id,g,rasterArtifactId,{...selection,clockwiseDegrees:0}]);return g;
 });
 const w=await transaction(actor,c=>checkedWorkspace(c,engineId));
 const registration=await transaction(actor,c=>saveSceneRegistration(c,actor,engineId,{version:w.version,inputRevision:w.inputRevision,sceneArtifactId:artifactId,geometryRevisionId:geometry.id,floorId:'ground',anchors:[{scene:[0,0,0],plan:[0,0,0]},{scene:[1,0,0],plan:[2,0,0]},{scene:[0,1,0],plan:[0,2,0]}],cameraAnchors:[{id:'camera',label:'Observed room viewpoint',scene:[1,1,.75],roomId:'room'},{id:'excluded-camera',label:'Excluded viewpoint',scene:[.5,.5,.75],roomId:'room'}],note:'Authored correspondences and two private camera observations, not measured property or training evidence.'}));
 return {geometry,registration};
}
