import {createHash} from 'node:crypto';
import {digitizationGeometryRevision,triangulateDigitizationRoom,type DigitizationGeometryRevision} from '@haven/contracts';
type Point=[number,number,number];
const MAX_VERTICES=300000;
function subtract(a:Point,b:Point):Point{return a.map((v,i)=>v-b[i]) as Point;}
function normal(a:Point,b:Point,c:Point):Point{const u=subtract(b,a),v=subtract(c,a),n:Point=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...n);if(!length)throw Error('STRUCTURAL_DEGENERATE_FACE');return n.map(value=>value/length) as Point;}
/** Canonical Z-up → glTF Y-up. This rotation preserves handedness. */
function convert([x,y,z]:Point):Point{return [x,z,-y];}
export function renderStructuralGlb(input:DigitizationGeometryRevision,slabThickness='0.10'){
 const geometry=digitizationGeometryRevision.parse(input),thickness=Number(slabThickness);
 if(geometry.unit!=='m'||!['estimated','measured'].includes(geometry.scaleStatus))throw Error('STRUCTURAL_SCALE_REQUIRED');
 if(!/^0\.\d{1,4}$/.test(slabThickness)||thickness<.001||thickness>.5)throw Error('STRUCTURAL_SLAB_PROFILE_INVALID');
 const document:any={asset:{version:'2.0',generator:'Haven structural geometry v1',extras:{geometryId:geometry.id,geometryRevision:geometry.revision,scaleStatus:geometry.scaleStatus,reviewStatus:geometry.review.status,modelType:'structural',coordinateConversion:'canonical(x,y,z)-to-gltf(x,z,-y)',slabThickness:{amount:slabThickness,unit:'m',basis:'illustrative_assumption'},limitations:['Visualization slab thickness is an illustrative assumption; geometry room net area is not official built-up area.']}},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],bufferViews:[],accessors:[],buffers:[{byteLength:0}],materials:[{name:'floor',pbrMetallicRoughness:{baseColorFactor:[.19,.46,.37,1],metallicFactor:0,roughnessFactor:1},doubleSided:true},{name:'wall',pbrMetallicRoughness:{baseColorFactor:[.78,.78,.74,1],metallicFactor:0,roughnessFactor:1}},{name:'draft wall',pbrMetallicRoughness:{baseColorFactor:[.8,.55,.24,1],metallicFactor:0,roughnessFactor:1}}]};
 const buffers:Buffer[]=[];let offset=0,totalTriangles=0;
 function mesh(name:string,extras:Record<string,unknown>,material:number,build:(triangle:(a:Point,b:Point,c:Point)=>void)=>void){
  const positions:number[]=[],normals:number[]=[];
  function triangle(a:Point,b:Point,c:Point){if(++totalTriangles>MAX_VERTICES/3)throw Error('STRUCTURAL_GEOMETRY_BUDGET_EXCEEDED');const vertices=[convert(a),convert(b),convert(c)].map(point=>point.map(value=>{const quantized=Math.fround(value);if(Math.abs(value-quantized)>1e-4)throw Error('STRUCTURAL_COORDINATE_PRECISION_REQUIRED');return quantized;}) as Point),n=normal(vertices[0],vertices[1],vertices[2]);positions.push(...vertices.flat());normals.push(...n,...n,...n);}
  build(triangle);if(!positions.length)return;
  const attributes:Record<string,number>={};
  for(const [semantic,values] of [['POSITION',positions],['NORMAL',normals]] as const){
   const bytes=Buffer.alloc(values.length*4);for(let index=0;index<values.length;index++)bytes.writeFloatLE(values[index],index*4);
   const view=document.bufferViews.length;document.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length,target:34962});offset+=bytes.length;buffers.push(bytes);
   const accessor:any={bufferView:view,componentType:5126,count:values.length/3,type:'VEC3'};
   if(semantic==='POSITION'){accessor.min=[Infinity,Infinity,Infinity];accessor.max=[-Infinity,-Infinity,-Infinity];for(let index=0;index<values.length;index++){const axis=index%3,value=bytes.readFloatLE(index*4);accessor.min[axis]=Math.min(accessor.min[axis],value);accessor.max[axis]=Math.max(accessor.max[axis],value);}}
   attributes[semantic]=document.accessors.length;document.accessors.push(accessor);
  }
  const node=document.nodes.length;document.scenes[0].nodes.push(node);document.nodes.push({name,mesh:document.meshes.length,extras});document.meshes.push({name,primitives:[{attributes,material,mode:4}]});
 }
 function box(triangle:(a:Point,b:Point,c:Point)=>void,wall:DigitizationGeometryRevision['walls'][number],x1:number,x2:number,z1:number,z2:number,elevation:number){
  if(x2-x1<1e-9||z2-z1<1e-9)return;
  const dx=wall.end.x-wall.start.x,dy=wall.end.y-wall.start.y,length=Math.hypot(dx,dy),ux=dx/length,uy=dy/length,nx=-uy*Number(wall.thickness)/2,ny=ux*Number(wall.thickness)/2;
  const point=(x:number,side:number,z:number):Point=>[wall.start.x+ux*x+side*nx,wall.start.y+uy*x+side*ny,elevation+z];
  const points=[point(x1,-1,z1),point(x2,-1,z1),point(x2,1,z1),point(x1,1,z1),point(x1,-1,z2),point(x2,-1,z2),point(x2,1,z2),point(x1,1,z2)];
  for(const [a,b,c,d] of [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]]){triangle(points[a],points[b],points[c]);triangle(points[a],points[c],points[d]);}
 }
 for(const floor of geometry.floors){
  const elevation=Number(floor.elevation);
  for(const room of geometry.rooms.filter(room=>room.floorId===floor.id))mesh(room.name,{roomId:room.id,floorId:floor.id,kind:'floor_slab'},0,triangle=>{
   const topology=triangulateDigitizationRoom(room.polygon,room.holes);
   for(let i=0;i<topology.indices.length;i+=3){const p=topology.indices.slice(i,i+3).map(index=>topology.vertices[index]);if((p[1].x-p[0].x)*(p[2].y-p[0].y)-(p[1].y-p[0].y)*(p[2].x-p[0].x)<0)[p[1],p[2]]=[p[2],p[1]];
    triangle(...p.map(q=>[q.x,q.y,elevation] as Point) as [Point,Point,Point]);triangle(...[...p].reverse().map(q=>[q.x,q.y,elevation-thickness] as Point) as [Point,Point,Point]);}
   for(const [index,ring] of [room.polygon,...room.holes].entries()){
    const signed=ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p.x*q.y-q.x*p.y;},0);
    const points=(signed>0)===(index===0)?ring:[...ring].reverse();
    for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],bottomA:Point=[a.x,a.y,elevation-thickness],bottomB:Point=[b.x,b.y,elevation-thickness],topA:Point=[a.x,a.y,elevation],topB:Point=[b.x,b.y,elevation];triangle(bottomA,bottomB,topB);triangle(bottomA,topB,topA);}
   }
  });
  for(const wall of geometry.walls.filter(wall=>wall.floorId===floor.id)){
   const heightSource=wall.height||floor.height;if(!heightSource)throw Error('STRUCTURAL_HEIGHT_REQUIRED');const height=Number(heightSource.amount),length=Math.hypot(wall.end.x-wall.start.x,wall.end.y-wall.start.y);
   const openings=geometry.openings.filter(opening=>opening.wallId===wall.id&&opening.confirmed);
   for(const opening of openings)if(opening.sill===null||opening.height===null)throw Error('STRUCTURAL_OPENING_HEIGHT_REQUIRED');else if(Number(opening.sill)+Number(opening.height)>height+1e-8)throw Error('STRUCTURAL_OPENING_OUTSIDE_WALL');
   const cuts=[...new Set([0,length,...openings.flatMap(opening=>[Number(opening.offset),Number(opening.offset)+Number(opening.width)])])].sort((a,b)=>a-b);
   if(cuts.length*(openings.length*2+2)>50000)throw Error('STRUCTURAL_GEOMETRY_BUDGET_EXCEEDED');
   mesh(wall.id,{wallId:wall.id,floorId:floor.id,kind:'wall',confirmed:wall.confirmed,heightBasis:heightSource.basis,openingIds:openings.map(opening=>opening.id)},wall.confirmed?1:2,triangle=>{
    for(let i=0;i<cuts.length-1;i++){const x1=cuts[i],x2=cuts[i+1],middle=(x1+x2)/2,active=openings.filter(opening=>middle>Number(opening.offset)&&middle<Number(opening.offset)+Number(opening.width)),zCuts=[...new Set([0,height,...active.flatMap(opening=>[Number(opening.sill),Number(opening.sill)+Number(opening.height)])])].sort((a,b)=>a-b);
     for(let j=0;j<zCuts.length-1;j++){const z1=zCuts[j],z2=zCuts[j+1],z=(z1+z2)/2;if(!active.some(opening=>z>Number(opening.sill)&&z<Number(opening.sill)+Number(opening.height)))box(triangle,wall,x1,x2,z1,z2,elevation);}
    }
   });
  }
 }
 if(!document.meshes.length)throw Error('STRUCTURAL_EMPTY_GEOMETRY');
 document.asset.extras.unconfirmedOpeningIds=geometry.openings.filter(opening=>!opening.confirmed).map(opening=>opening.id);
 document.asset.extras.unrenderedStairConnections=geometry.stairs.map(stair=>({id:stair.id,fromFloorId:stair.fromFloorId,toFloorId:stair.toFloorId}));
 document.buffers[0].byteLength=offset;
 const rawJson=Buffer.from(JSON.stringify(document)),json=Buffer.alloc(Math.ceil(rawJson.length/4)*4,0x20);rawJson.copy(json);const binary=Buffer.concat(buffers,offset),header=Buffer.alloc(20),binHeader=Buffer.alloc(8);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+json.length+8+binary.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);binHeader.writeUInt32LE(binary.length,0);binHeader.writeUInt32LE(0x004e4942,4);
 const body=Buffer.concat([header,json,binHeader,binary]);return {body,sha256:createHash('sha256').update(body).digest('hex'),format:'glb' as const,processingProfile:'structural-glb-v1',geometryRevision:geometry.revision,scaleStatus:geometry.scaleStatus,privacyReview:'pending' as const,publicationReview:'pending' as const};
}
