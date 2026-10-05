import {describe,it,expect} from 'vitest';
import {floorLayout,mappedRoom} from '../../packages/contracts/src/property-media';
import {modelVertices,projectModel} from '../../apps/web/src/spatial-model';
const room={id:'living',label:'Living room',sceneId:'10000000-0000-4000-8000-000000002001',polygon:[{x:0.1,y:0.1},{x:0.8,y:0.1},{x:0.8,y:0.8},{x:0.1,y:0.8}],heightMetres:2.7,camera:{x:0.4,y:0.4,headingDegrees:0}};
const layout={name:'Ground floor',level:0,widthMetres:10,depthMetres:8,elevationMetres:0,northDegrees:0,rooms:[room]};
describe('authored spatial layout validation',()=>{
 it('accepts measured convex room outlines and rejects a camera outside its room',()=>{expect(floorLayout.safeParse(layout).success).toBe(true);expect(mappedRoom.safeParse({...room,camera:{...room.camera,x:0.9}}).success).toBe(false);});
 it('rejects crossed, concave, repeated and out-of-bounds outlines',()=>{
  for(const polygon of [[room.polygon[0],room.polygon[2],room.polygon[1],room.polygon[3]],[{x:0.1,y:0.1},{x:0.8,y:0.1},{x:0.4,y:0.4},{x:0.8,y:0.8},{x:0.1,y:0.8}],[...room.polygon,room.polygon[0]],[{x:-0.1,y:0.1},...room.polygon.slice(1)]])expect(mappedRoom.safeParse({...room,polygon}).success).toBe(false);
  const star=Array.from({length:5},(_,i)=>{const angle=(i*2%5)*2*Math.PI/5;return{x:0.5+Math.cos(angle)*0.4,y:0.5+Math.sin(angle)*0.4};});expect(mappedRoom.safeParse({...room,polygon:star}).success).toBe(false);
 });
 it('rejects duplicate scene mappings and excessive dimensions',()=>{expect(floorLayout.safeParse({...layout,rooms:[room,{...room,id:'other'}]}).success).toBe(false);expect(floorLayout.safeParse({...layout,widthMetres:501}).success).toBe(false);});
});
describe('plan-derived 3D mesh',()=>{
 it('creates real walls at supplied heights and floor elevations',()=>{const floors=[{id:'ground',spatial:layout},{id:'upper',spatial:{...layout,elevationMetres:3}}],vertices=modelVertices(floors);expect(vertices.length).toBe(60);expect(new Set(vertices.map(v=>v.point[1]))).toEqual(new Set([0,2.7,3,5.7]));});
 it('projects finite geometry and changes coordinates when the model orbits',()=>{const floors=[{id:'ground',spatial:layout}],camera={yaw:-30,pitch:50,zoom:1.3};for(const vertex of modelVertices(floors))expect(projectModel(vertex.point,floors,camera).every(Number.isFinite)).toBe(true);const point:[number,number,number]=[2,2.7,3];expect(projectModel(point,floors,camera)).not.toEqual(projectModel(point,floors,{...camera,yaw:45}));});
});
