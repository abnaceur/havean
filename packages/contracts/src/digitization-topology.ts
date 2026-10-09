import earcut from 'earcut';
export type PlanPoint={x:number;y:number};
const epsilon=1e-9;
function cross(a:PlanPoint,b:PlanPoint,c:PlanPoint){return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);}
function onSegment(a:PlanPoint,b:PlanPoint,p:PlanPoint){return Math.abs(cross(a,b,p))<=epsilon&&p.x>=Math.min(a.x,b.x)-epsilon&&p.x<=Math.max(a.x,b.x)+epsilon&&p.y>=Math.min(a.y,b.y)-epsilon&&p.y<=Math.max(a.y,b.y)+epsilon;}
function intersects(a:PlanPoint,b:PlanPoint,c:PlanPoint,d:PlanPoint){const ab1=cross(a,b,c),ab2=cross(a,b,d),cd1=cross(c,d,a),cd2=cross(c,d,b);return ab1*ab2<0&&cd1*cd2<0||onSegment(a,b,c)||onSegment(a,b,d)||onSegment(c,d,a)||onSegment(c,d,b);}
export function ringArea(ring:readonly PlanPoint[]){return Math.abs(ring.reduce((sum,p,i)=>{const next=ring[(i+1)%ring.length];return sum+p.x*next.y-next.x*p.y;},0))/2;}
function inside(p:PlanPoint,ring:readonly PlanPoint[]){let odd=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if(onSegment(a,b,p))return false;if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)odd=!odd;}return odd;}
function ringsIntersect(a:readonly PlanPoint[],b:readonly PlanPoint[]){return a.some((p,i)=>b.some((q,j)=>intersects(p,a[(i+1)%a.length],q,b[(j+1)%b.length])));}
function ringError(ring:readonly PlanPoint[]){
 if(ring.length<3||ring.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return 'Ring requires finite points';
 for(let i=0;i<ring.length;i++){
  const a=ring[i],b=ring[(i+1)%ring.length];if(a.x===b.x&&a.y===b.y)return 'Duplicate adjacent polygon vertex';
  for(let j=i+1;j<ring.length;j++){if(j===i+1||i===0&&j===ring.length-1)continue;if(intersects(a,b,ring[j],ring[(j+1)%ring.length]))return 'Self-intersecting polygon';}
 }
 if(ringArea(ring)<=epsilon)return 'Polygon has zero area';
 return null;
}
export function roomTopologyError(polygon:readonly PlanPoint[],holes:readonly (readonly PlanPoint[])[]=[]):string|null{
 const outerError=ringError(polygon);if(outerError)return outerError;
 for(let i=0;i<holes.length;i++){
  const hole=holes[i],error=ringError(hole);if(error)return error;
  if(ringsIntersect(polygon,hole)||!hole.every(p=>inside(p,polygon)))return 'Hole must be strictly inside its room';
  for(let j=0;j<i;j++)if(ringsIntersect(hole,holes[j])||inside(hole[0],holes[j])||inside(holes[j][0],hole))return 'Room holes cannot overlap or nest';
 }
 return null;
}
export function triangulateDigitizationRoom(polygon:readonly PlanPoint[],holes:readonly (readonly PlanPoint[])[]=[]){
 const error=roomTopologyError(polygon,holes);if(error)throw new Error(error);
 const vertices=[...polygon,...holes.flat()].map(p=>({...p})),holeIndices:number[]=[];let offset=polygon.length;
 for(const hole of holes){holeIndices.push(offset);offset+=hole.length;}
 const indices=earcut(vertices.flatMap(p=>[p.x,p.y]),holeIndices,2);
 const expectedArea=ringArea(polygon)-holes.reduce((sum,hole)=>sum+ringArea(hole),0);
 let triangleArea=0;
 for(let i=0;i<indices.length;i+=3)triangleArea+=Math.abs(cross(vertices[indices[i]],vertices[indices[i+1]],vertices[indices[i+2]]))/2;
 if(!indices.length||Math.abs(triangleArea-expectedArea)>Math.max(1e-8,expectedArea*1e-8))throw new Error('Triangulation does not preserve room area');
 return {vertices,indices,coordinateArea:expectedArea,areaBasis:'geometry_room_net' as const};
}
