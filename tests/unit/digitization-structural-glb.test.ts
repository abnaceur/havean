import {expect,it} from 'vitest';
import {createRequire} from 'node:module';
import {renderStructuralGlb} from '../../apps/api/src/inventory/digitization/structural-glb';
import type {DigitizationGeometryRevision} from '../../packages/contracts/src/digitization-geometry';
const {validateBytes}=createRequire(import.meta.url)('gltf-validator');
const requireWeb=createRequire(new URL('../../apps/web/package.json',import.meta.url));
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`,source={kind:'manual' as const,actorId:id(3),note:'Authored synthetic geometry fixture'};
const geometry:DigitizationGeometryRevision={schemaVersion:2,id:id(1),organizationId:id(2),targetId:id(4),revision:1,parentRevision:null,coordinateSystem:'right-handed-z-up',unit:'m',scaleStatus:'estimated',sourceAssets:[],sources:[source],scaleAnchors:[{id:'anchor',points:[{x:0,y:0},{x:10,y:0}],distanceMetres:'10',source,reviewerId:id(3),status:'confirmed'}],floors:[{id:'ground',name:'Ground',elevation:'2',height:{amount:'3',basis:'supplied_unverified',source},source}],rooms:[{id:'room',floorId:'ground',name:'Synthetic concave room',type:'living',polygon:[{x:0,y:0},{x:10,y:0},{x:10,y:8},{x:6,y:8},{x:6,y:4},{x:0,y:4}],holes:[[{x:1,y:1},{x:3,y:1},{x:3,y:3},{x:1,y:3}]],panoramaSceneId:null,source,areaBasis:'geometry_room_net'}],walls:[{id:'wall',floorId:'ground',start:{x:0,y:0},end:{x:10,y:0},thickness:'0.2',height:null,source,confirmed:true}],openings:[{id:'door',wallId:'wall',offset:'2',width:'1',type:'door',sill:'0',height:'2',source,confirmed:true},{id:'window',wallId:'wall',offset:'5',width:'2',type:'window',sill:'1',height:'1',source,confirmed:true}],stairs:[],review:{status:'pending',actorId:null}};
// Independent binary reader and signed-volume check, rather than renderer internals.
function meshes(body:Buffer){const size=body.readUInt32LE(12),document=JSON.parse(body.subarray(20,20+size).toString()),start=28+size;return {document,meshes:document.nodes.map((node:any)=>{const mesh=document.meshes[node.mesh],accessor=document.accessors[mesh.primitives[0].attributes.POSITION],view=document.bufferViews[accessor.bufferView],points:number[][]=[];for(let i=0;i<accessor.count;i++)points.push([0,1,2].map(axis=>body.readFloatLE(start+view.byteOffset+i*12+axis*4)));return {node,points};})};}
function volume(points:number[][]){let total=0;for(let i=0;i<points.length;i+=3){const [a,b,c]=points.slice(i,i+3);total+=a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]);}return total/6;}
it('HE-E10 real GLB validates, preserves concave/hole slab volume and actual door/window voids with explicit axis conversion',async()=>{
 const artifact=renderStructuralGlb(geometry);expect(artifact.body.readUInt32LE(0)).toBe(0x46546c67);expect(artifact.body.readUInt32LE(8)).toBe(artifact.body.length);
 const report=await validateBytes(new Uint8Array(artifact.body),{uri:'synthetic-structural.glb',maxIssues:100});expect(report.issues.numErrors,JSON.stringify(report.issues.messages)).toBe(0);expect(report.issues.numWarnings,JSON.stringify(report.issues.messages)).toBe(0);
 const {GLTFLoader}=await import(requireWeb.resolve('three/addons/loaders/GLTFLoader.js'));
 const actual=await new GLTFLoader().parseAsync(new Uint8Array(artifact.body).buffer,'');
 const loadedRooms:any[]=[];actual.scene.traverse((node:any)=>{if(node.userData.roomId)loadedRooms.push(node);});expect(loadedRooms.map(node=>node.userData.roomId)).toEqual(['room']);expect(loadedRooms[0].geometry.getAttribute('position').count).toBeGreaterThan(0);
 const loaded=meshes(artifact.body),room=loaded.meshes.find((m:any)=>m.node.extras.roomId==='room'),wall=loaded.meshes.find((m:any)=>m.node.extras.wallId==='wall');
 expect(volume(room.points)).toBeCloseTo(52*.1,5);expect(volume(wall.points)).toBeCloseTo((10*3-1*2-2*1)*.2,5);
 expect(Math.max(...room.points.map((p:number[])=>p[1]))).toBe(2);expect(Math.min(...room.points.map((p:number[])=>p[2]))).toBe(-8);
 expect(wall.node.extras.openingIds).toEqual(['door','window']);expect(wall.node.extras.heightBasis).toBe('supplied_unverified');expect(loaded.document.asset.extras.slabThickness.basis).toBe('illustrative_assumption');expect(artifact.publicationReview).toBe('pending');expect(renderStructuralGlb(geometry).body.equals(artifact.body)).toBe(true);
 expect(JSON.stringify(loaded.document)).not.toContain('uri');
});
it('refuses invented metric scale, height and opening vertical dimensions',()=>{
 expect(()=>renderStructuralGlb({...geometry,unit:'px',scaleStatus:'unscaled',scaleAnchors:[]})).toThrow('STRUCTURAL_SCALE_REQUIRED');
 expect(()=>renderStructuralGlb({...geometry,floors:[{...geometry.floors[0],height:null}]})).toThrow('STRUCTURAL_HEIGHT_REQUIRED');
 expect(()=>renderStructuralGlb({...geometry,openings:[{...geometry.openings[0],height:null}]})).toThrow('STRUCTURAL_OPENING_HEIGHT_REQUIRED');
 expect(()=>renderStructuralGlb({...geometry,openings:[{...geometry.openings[1],sill:'2.5'}]})).toThrow('STRUCTURAL_OPENING_OUTSIDE_WALL');
 expect(()=>renderStructuralGlb(geometry,'0')).toThrow('STRUCTURAL_SLAB_PROFILE_INVALID');
});
