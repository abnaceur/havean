import {describe,expect,it} from 'vitest';
import {floorLayout} from '../../packages/contracts/src/property-media';
import {canonicalToThreeYUp,legacyFloorToGeometry,legacyYUpToCanonical} from '../../packages/contracts/src/legacy-digitization-geometry';
import {modelVertices} from '../../apps/web/src/spatial-model';
const id='10000000-0000-4000-8000-000000002001';
const input={name:'Upper floor',level:1,widthMetres:10,depthMetres:8,elevationMetres:3,northDegrees:40,rooms:[{id:'living',label:'Living room',sceneId:id,polygon:[{x:0.1,y:0.1},{x:0.8,y:0.1},{x:0.8,y:0.8},{x:0.1,y:0.8}],camera:{x:0.4,y:0.4,headingDegrees:20}}]};
describe('HE-R05 one-way legacy geometry compatibility',()=>{
 it('keeps schema defaults, original record and approved model vertices unchanged',()=>{
  const original=structuredClone(input),layout=floorLayout.parse(input),before=modelVertices([{id,spatial:layout}]);
  const converted=legacyFloorToGeometry(id,input);
  expect(input).toEqual(original);expect(modelVertices([{id,spatial:layout}])).toEqual(before);
  expect(converted.rooms[0].polygon.map(canonicalToThreeYUp)).toEqual(input.rooms[0].polygon.map(p=>[(p.x-.5)*10,3,(p.y-.5)*8]));
  expect(converted.rooms[0].panoramaLink).toMatchObject({sceneId:id,headingDegrees:20});
  expect(canonicalToThreeYUp(converted.rooms[0].panoramaLink.planPosition)).toEqual([-.9999999999999998,3,-.7999999999999998]);
 });
 it('never upgrades authoring defaults or supplied dimensions to measured geometry',()=>{
  const defaults=legacyFloorToGeometry(id,input),supplied=legacyFloorToGeometry(id,{...input,rooms:[{...input.rooms[0],heightMetres:3.2}]});
  expect(defaults.scaleStatus).toBe('legacy_supplied_unverified');expect(defaults.metricMeasurementsAvailable).toBe(false);expect(defaults.scaleAnchors).toEqual([]);
  expect(defaults.rooms[0].height).toEqual({value:2.7,evidence:'legacy_default_illustrative'});
  expect(supplied.rooms[0].height).toEqual({value:3.2,evidence:'legacy_supplied_unverified'});
  // A previously serialized 2.7 default cannot be distinguished from supplied
  // 2.7; historical serialization remains unverified, never measured.
  expect(legacyFloorToGeometry(id,floorLayout.parse(input)).rooms[0].height.evidence).toBe('legacy_supplied_unverified');
  expect(supplied.floor.dimensions.evidence).toBe('legacy_supplied_unverified');
 });
 it('applies a right-handed rotation and a tested Three.js inverse at all floors',()=>{
  const x=legacyYUpToCanonical([1,0,0]),y=legacyYUpToCanonical([0,1,0]),z=legacyYUpToCanonical([0,0,1]);
  expect({x:x.y*y.z-x.z*y.y,y:x.z*y.x-x.x*y.z,z:x.x*y.y-x.y*y.x}).toEqual(z);
  for(const point of [[2,3,-4],[-10,-2,7],[0,0,0]] as const) expect(canonicalToThreeYUp(legacyYUpToCanonical(point))).toEqual([...point]);
  expect(legacyFloorToGeometry(id,input).floor.elevation).toBe(3);
 });
 it('retains legacy required panorama and convexity validation',()=>{
  expect(()=>legacyFloorToGeometry(id,{...input,rooms:[{...input.rooms[0],sceneId:undefined}]})).toThrow();
  expect(()=>legacyFloorToGeometry(id,{...input,rooms:[{...input.rooms[0],polygon:[{x:.1,y:.1},{x:.8,y:.1},{x:.4,y:.4},{x:.8,y:.8},{x:.1,y:.8}]}]})).toThrow();
  expect(()=>legacyFloorToGeometry('unscoped-object-key',input)).toThrow();
 });
});
