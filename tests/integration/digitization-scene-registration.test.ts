import '../support/env';
import {readFileSync} from 'node:fs';
import {afterAll,it,expect} from 'vitest';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {checkedWorkspace} from '../../apps/api/src/inventory/digitization/intakes';
import {readSceneRegistrations,saveSceneRegistration} from '../../apps/api/src/inventory/digitization/scene-registration';
import {readPlanPageSelection} from '../../apps/api/src/inventory/digitization/plan-selection';
import {readPrivateSceneTier} from '../../apps/api/src/inventory/digitization/scene-preview';
import {digitizationSceneRegistrationCreate,digitizationGeometryRevision} from '../../packages/contracts/src/index';
const actor:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']};
const foreign:Actor={id:'00000000-0000-4000-8000-000000000011',orgId:'10000000-0000-4000-8000-000000000005',roles:['agency_manager']};
afterAll(()=>pool.end());
it.each(['desktop','mobile'])('current private camera proposals remain pending, refuse stale and foreign scope, and SQL independently fences transformed room links on %s',async project=>{
 const {engineId,artifactId,rasterArtifactId,sourceAssetId}=JSON.parse(readFileSync(`infra/generated/integration/scene-preview-anchors-${project}.json`,'utf8'));
 expect((await readPrivateSceneTier(actor,engineId,artifactId)).byteLength).toBeGreaterThan(0);
 const selection=await readPlanPageSelection(actor,engineId,rasterArtifactId,0);
 const g=await transaction(actor,async c=>{
  const w=await checkedWorkspace(c,engineId),source={...selection.source,originalToModel:selection.source.originalToModel.map((v,i)=>i<6?v*.01:v)};
  const g=digitizationGeometryRevision.parse({schemaVersion:2,id:crypto.randomUUID(),organizationId:actor.orgId,targetId:w.target.id,revision:1,parentRevision:null,coordinateSystem:'right-handed-z-up',unit:'m',scaleStatus:'estimated',sourceAssets:[sourceAssetId],sources:[source],scaleAnchors:[{id:'scale',points:[{x:0,y:0},{x:2,y:0}],distanceMetres:'2',source,reviewerId:actor.id,status:'confirmed'}],floors:[{id:'ground',name:'Ground',elevation:'0',height:{amount:'3',basis:'supplied_unverified',source},source}],rooms:[{id:'room',floorId:'ground',name:'Room',type:'living',polygon:[{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}],holes:[[{x:3,y:3},{x:4,y:3},{x:4,y:4},{x:3,y:4}]],panoramaSceneId:null,source,areaBasis:'geometry_room_net'}],walls:[],openings:[],stairs:[],review:{status:'pending',actorId:null}});
  await c.query(`INSERT INTO geometry_revisions(id,digitization_id,organization_id,created_by,revision,schema_version,geometry,scale_status,input_revision,source_artifact_id,source_selection) VALUES($1,$2,$3,$4,1,2,$5,'estimated',1,$6,$7)`,[g.id,engineId,actor.orgId,actor.id,g,rasterArtifactId,{...selection,clockwiseDegrees:0}]);return g;
 });
 const w=await transaction(actor,c=>checkedWorkspace(c,engineId)),input=digitizationSceneRegistrationCreate.parse({version:w.version,inputRevision:w.inputRevision,sceneArtifactId:artifactId,geometryRevisionId:g.id,floorId:'ground',anchors:[{scene:[0,0,0],plan:[0,0,0]},{scene:[1,0,0],plan:[2,0,0]},{scene:[0,1,0],plan:[0,2,0]}],cameraAnchors:[{id:'camera',label:'Authored viewpoint',scene:[1,1,.75],roomId:'room'}],note:'Observed test correspondences; independent navigation review remains absent.'});
 await expect(transaction(foreign,c=>readSceneRegistrations(c,foreign,engineId))).rejects.toMatchObject({status:404});
 await expect(transaction(actor,c=>saveSceneRegistration(c,actor,engineId,{...input,version:input.version+1}))).rejects.toMatchObject({status:409});
 await expect(transaction(actor,c=>saveSceneRegistration(c,actor,engineId,{...input,geometryRevisionId:crypto.randomUUID()}))).rejects.toMatchObject({status:409});
 await expect(transaction(actor,c=>saveSceneRegistration(c,actor,engineId,{...input,cameraAnchors:[{...input.cameraAnchors[0],scene:[1.75,1.75,.75]}]}))).rejects.toMatchObject({status:422});
 const saved=await transaction(actor,c=>saveSceneRegistration(c,actor,engineId,input));
 expect(saved).toMatchObject({planNavigationAvailable:false,metricMeasurementsAvailable:false,publiclyServed:false,reviewStatus:'pending',cameraAnchors:[{planPosition:[2,2,1.5]}]});
 await expect(transaction(actor,c=>saveSceneRegistration(c,actor,engineId,input))).rejects.toMatchObject({status:409});
 for(const change of ['outside','hole','height','duplicate','approval']){
  const registration={...saved},camera={...saved.cameraAnchors[0]};
  if(change==='outside'){camera.scene=[6,1,.75];camera.planPosition=[12,2,1.5];}
  if(change==='hole'){camera.scene=[1.75,1.75,.75];camera.planPosition=[3.5,3.5,1.5];}
  if(change==='height'){camera.scene=[1,1,2];camera.planPosition=[2,2,4];}
  registration.cameraAnchors=change==='duplicate'?[camera,camera]:[camera];
  const payload=change==='approval'?{...registration,planNavigationAvailable:true}:registration;
  await expect(transaction(actor,async c=>{await c.query(`INSERT INTO digitization_scene_registrations(digitization_id,organization_id,created_by,workspace_version,input_revision,scene_artifact_id,geometry_revision_id,floor_id,anchors,metres_per_scene_unit,registration,note) SELECT digitization_id,organization_id,created_by,$2,input_revision,scene_artifact_id,geometry_revision_id,floor_id,anchors,metres_per_scene_unit,$3,note FROM digitization_scene_registrations WHERE id=$1`,[saved.id,saved.workspaceVersion,payload]);})).rejects.toMatchObject({code:'23514'});
 }
 await transaction(actor,async c=>{expect((await c.query('UPDATE digitization_scene_registrations SET note=$2 WHERE id=$1',[saved.id,'Cannot rewrite history'])).rowCount).toBe(0);expect((await c.query('DELETE FROM digitization_scene_registrations WHERE id=$1',[saved.id])).rowCount).toBe(0);});
 const results=await Promise.allSettled([0,1].map(()=>transaction(actor,c=>saveSceneRegistration(c,actor,engineId,{...input,version:saved.workspaceVersion}))));expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
 expect(await transaction(actor,c=>readSceneRegistrations(c,actor,engineId))).toHaveLength(2);
});
