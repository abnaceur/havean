import {describe,it,expect} from 'vitest';
import {estimateSceneRegistration,projectSceneCameraAnchors} from '../../apps/api/src/inventory/digitization/scene-registration';
import {digitizationSceneRegistrationCreate} from '../../packages/contracts/src/digitization-registration';
const point=(x:number,y:number,z:number):[number,number,number]=>[x,y,z];
const input=()=>digitizationSceneRegistrationCreate.parse({version:1,inputRevision:1,sceneArtifactId:crypto.randomUUID(),geometryRevisionId:crypto.randomUUID(),floorId:'floor-1',anchors:[{scene:point(0,0,0),plan:point(10,20,0)},{scene:point(1,0,0),plan:point(10,22,0)},{scene:point(0,1,0),plan:point(8,20,0)},{scene:point(1,1,0),plan:point(8,22,0)}],note:'Observed matching floor corners'});
describe('private scene registration estimates',()=>{
 it('fits a proper rotated/scaled/translated transform while keeping measurement and navigation unavailable',()=>{
  const result=estimateSceneRegistration(input());
  expect(result.sceneToPlan).toEqual([0,-2,0,10,2,0,0,20,0,0,2,0,0,0,0,1]);
  expect(result.metresPerSceneUnit).toBe('2');expect(result.maximumResidualMetres).toBe(0);
  expect(result).toMatchObject({scaleStatus:'estimated',reviewStatus:'pending',metricMeasurementsAvailable:false,planNavigationAvailable:false,publiclyServed:false});
 });
 it('refuses collinear, mismatched and reflected anchor sets instead of guessing registration',()=>{
  for(const change of ['collinear','mismatch','reflection']){
   const x=input();if(change==='collinear')x.anchors[2].scene=point(2,0,0);else if(change==='mismatch')x.anchors[3].plan=point(9,24,0);else{x.anchors.push({scene:point(0,0,1),plan:point(10,20,-2)});}
   expect(()=>estimateSceneRegistration(x)).toThrow();
  }
 });
 it('refuses absent/duplicate/nonfinite anchors and callers cannot submit an approval or supplied transform',()=>{
  const x=input();x.anchors[1].scene=x.anchors[0].scene;expect(()=>estimateSceneRegistration(x)).toThrow();
  expect(digitizationSceneRegistrationCreate.safeParse({...input(),anchors:[]}).success).toBe(false);
  expect(digitizationSceneRegistrationCreate.safeParse({...input(),reviewStatus:'approved'}).success).toBe(false);
  expect(digitizationSceneRegistrationCreate.safeParse({...input(),sceneToPlan:Array(16).fill(0)}).success).toBe(false);
 });
});

const actor='10000000-0000-4000-8000-000000000001';
function geometry(){
 const source={kind:'manual' as const,actorId:actor,note:'Authored plan for anchor refusal checks'};
 return {schemaVersion:2 as const,id:crypto.randomUUID(),organizationId:actor,targetId:actor,revision:1,parentRevision:null,coordinateSystem:'right-handed-z-up' as const,unit:'m' as const,scaleStatus:'estimated' as const,sourceAssets:[],sources:[source],scaleAnchors:[{id:'scale',points:[{x:0,y:0},{x:2,y:0}] as [{x:number;y:number},{x:number;y:number}],distanceMetres:'2',source,reviewerId:actor,status:'confirmed' as const}],floors:[{id:'floor-1',name:'Ground',elevation:'0',height:{amount:'3',basis:'supplied_unverified' as const,source},source}],rooms:[{id:'room',floorId:'floor-1',name:'Room',type:'living',polygon:[{x:6,y:18},{x:12,y:18},{x:12,y:24},{x:6,y:24}],holes:[[{x:7,y:21},{x:8,y:21},{x:8,y:22},{x:7,y:22}]],panoramaSceneId:null,source,areaBasis:'geometry_room_net' as const}],walls:[],openings:[],stairs:[],review:{status:'pending' as const,actorId:null}};
}
it('projects observed camera coordinates without enabling navigation, refusing room holes, walls, wrong floors and heights',()=>{
 const x=input();x.cameraAnchors=[{id:'camera',label:'Observed room viewpoint',scene:[.5,.5,.75],roomId:'room'}];
 expect(projectSceneCameraAnchors(x,geometry())[0].planPosition).toEqual([9,21,1.5]);
 for(const scene of [[.75,1.25,.75],[.5,1,.75],[2,1,.75],[.5,.5,-.1],[.5,.5,2]] as [number,number,number][]){
  expect(()=>projectSceneCameraAnchors({...x,cameraAnchors:[{...x.cameraAnchors[0],scene}]},geometry())).toThrow();
 }
 expect(()=>projectSceneCameraAnchors({...x,cameraAnchors:[{...x.cameraAnchors[0],roomId:'missing'}]},geometry())).toThrow();
 expect(()=>projectSceneCameraAnchors({...x,floorId:'missing'},geometry())).toThrow();
 expect(digitizationSceneRegistrationCreate.safeParse({...x,cameraAnchors:[x.cameraAnchors[0],x.cameraAnchors[0]]}).success).toBe(false);
 expect(digitizationSceneRegistrationCreate.safeParse({...x,cameraAnchors:[{...x.cameraAnchors[0],planPosition:[9,21,1.5]}]}).success).toBe(false);
});
