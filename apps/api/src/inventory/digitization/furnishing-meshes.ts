import type {DigitizationGeometryRevision} from '@haven/contracts';
type Point=[number,number,number];
type Triangle=(a:Point,b:Point,c:Point)=>void;
type Emit=(name:string,color:string,build:(triangle:Triangle)=>void)=>void;
/** Small self-contained, untextured object meshes. All placements and sizes
 * are supplied by the author; no object detection or depth inference occurs. */
export function furnishingMeshes(item:NonNullable<DigitizationGeometryRevision['furnishings']>[number],elevation:number,emit:Emit){
 const W=Number(item.width),D=Number(item.depth),H=Number(item.height),angle=item.rotationDegrees*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
 const world=([x,y,z]:Point):Point=>[item.position.x+x*c-y*s,item.position.y+x*s+y*c,elevation+Number(item.bottom)+z];
 let serial=0;const wood='#ae8051',white='#eee8de',dark='#303736',metal='#8b9795',green='#607b50';
 function part(color:string,build:(triangle:Triangle)=>void){emit(item.id+'-'+serial++,color,triangle=>build((a,b,c)=>triangle(world(a),world(b),world(c))));}
 function box(x:number,y:number,z:number,w:number,d:number,h:number,color=item.color){part(color,triangle=>{const p:Point[]=[[-w/2,-d/2,0],[w/2,-d/2,0],[w/2,d/2,0],[-w/2,d/2,0],[-w/2,-d/2,h],[w/2,-d/2,h],[w/2,d/2,h],[-w/2,d/2,h]].map(([a,b,c])=>[a+x,b+y,c+z]);for(const [a,b,c,d] of [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]]){triangle(p[a],p[b],p[c]);triangle(p[a],p[c],p[d]);}});}
 function round(x:number,y:number,z:number,w:number,d:number,h:number,color=item.color,sphere=false){part(color,triangle=>{const N=16,M=sphere?8:1;
  const ring=(i:number,j:number):Point=>{const t=2*Math.PI*i/N,phi=Math.PI*j/M,r=sphere?Math.sin(phi):1;return [x+w/2*r*Math.cos(t),y+d/2*r*Math.sin(t),z+(sphere?(1-Math.cos(phi))/2:j)*h];};
  for(let j=0;j<M;j++)for(let i=0;i<N;i++){const a=ring(i,j),b=ring(i+1,j),c=ring(i+1,j+1),d=ring(i,j+1);if(!sphere||j>0)triangle(a,b,d);if(!sphere||j<M-1)triangle(b,c,d);}
  if(!sphere)for(let i=0;i<N;i++){triangle([x,y,z],ring(i+1,0),ring(i,0));triangle([x,y,z+h],ring(i,1),ring(i+1,1));}
 });}
 function legs(z:number,w=W,d=D){for(const x of [-1,1])for(const y of [-1,1])box(x*w*.38,y*d*.38,0,Math.min(.07,w*.1),Math.min(.07,d*.1),z,wood);}
 switch(item.kind){
  case 'sofa':case 'armchair':{
   legs(H*.18);box(0,0,H*.15,W,D,H*.22);box(0,D*.4,H*.35,W,D*.2,H*.65);
   for(const x of [-1,1])box(x*W*.45,0,H*.32,W*.1,D,H*.3);
   const n=item.kind==='sofa'?3:1;for(let i=0;i<n;i++){box((i-(n-1)/2)*W*.8/n,-D*.05,H*.36,W*.78/n,D*.69,H*.15,white);round((i-(n-1)/2)*W*.8/n,D*.25,H*.5,W*.72/n,D*.18,H*.36,item.color,true);}break;
  }
  case 'bed':
   legs(H*.15);box(0,0,H*.12,W,D,H*.24,wood);box(0,D*.465,H*.2,W,D*.07,H*.8);box(0,-D*.03,H*.36,W*.97,D*.91,H*.17,white);box(0,-D*.18,H*.53,W*.98,D*.6,H*.08);
   for(const x of [-1,1])round(x*W*.24,D*.27,H*.53,W*.42,D*.2,H*.11,white,true);break;
  case 'table':case 'coffee_table':
   round(0,0,0,W*.27,D*.27,H*.88,wood);round(0,0,H*.88,W,D,H*.12);break;
  case 'chair':
   legs(H*.48);box(0,0,H*.46,W,D,H*.09);box(0,D*.43,H*.5,W,D*.14,H*.5);break;
  case 'rug':box(0,0,0,W,D,H);break;
  case 'cabinet':case 'counter':case 'wardrobe':case 'fridge':{
   box(0,0,0,W,D,H);const n=Math.max(1,Math.round(W/.55));for(let i=0;i<n;i++){const x=(i-(n-1)/2)*W/n;box(x,-D*.505,H*.06,W/n*.94,D*.025,H*.88,item.kind==='fridge'?metal:wood);box(x+W/n*.3,-D*.53,H*.52,.025,.035,H*.16,metal);}
   if(item.kind==='counter'){box(0,0,H*.94,W,D,.06,white);for(const x of [-1,1])for(const y of [-1,1])round(x*W*.13,y*D*.2,H,W*.17,D*.22,.007,dark);}break;
  }
  case 'sink':
   box(0,0,0,W,D,H*.85,wood);box(0,0,H*.85,W,D,H*.08,white);round(0,0,H*.93,W*.7,D*.68,H*.05,metal);round(0,0,H*.98,W*.57,D*.55,H*.008,dark);box(0,D*.34,H*.93,.035,.035,H*.07,metal);break;
  case 'toilet':
   round(0,-D*.1,0,W*.65,D*.55,H*.45,white);round(0,-D*.1,H*.4,W,D*.7,H*.13,white);round(0,-D*.1,H*.53,W*.62,D*.48,.01,dark);box(0,D*.35,H*.4,W*.9,D*.25,H*.6,white);break;
  case 'bathtub':
   box(0,0,0,W,D,H,white);box(0,0,H*.92,W*.8,D*.82,.02,'#b3ced0');for(const x of [-1,1])box(x*W*.46,0,H*.85,W*.08,D,H*.15,white);break;
  case 'shower':
   box(0,0,0,W,D,.08,white);for(const x of [-1,1])box(x*W*.46,D*.45,0,.025,.025,H,metal);box(0,D*.45,H*.9,W*.9,.03,.03,metal);round(0,D*.23,H*.85,W*.25,D*.25,.025,metal);break;
  case 'plant':
   round(0,0,0,W*.4,D*.4,H*.28,wood);box(0,0,H*.25,.035,.035,H*.6,wood);
   for(let i=0;i<7;i++){const a=i*2.4;round(Math.cos(a)*W*.22,Math.sin(a)*D*.22,H*(.3+i*.065),W*.5,D*.48,H*.25,green,true);}break;
  case 'lamp':
   round(0,0,0,W*.6,D*.6,.035,metal);round(0,0,0,W*.06,D*.06,H*.75,metal);round(0,0,H*.7,W,D,H*.3,white);break;
  case 'tv':
   box(0,0,H*.2,W,D*.55,H*.8,dark);box(0,-D*.3,H*.24,W*.92,.01,H*.72,'#546e77');box(0,0,0,W*.45,D,H*.05,dark);box(0,0,0,.04,.04,H*.25,dark);break;
  case 'picture':
   box(0,0,0,W,D,H,wood);box(0,-D*.55,H*.04,W*.9,.006,H*.92,white);round(0,-D*.59,H*.22,W*.6,.008,H*.56,item.color,true);break;
  case 'curtain':
   for(let i=0;i<12;i++)round((i-5.5)*W/12,0,0,W/12,D,H);break;
 }
}
