import sharp from 'sharp';
import {digitizationGeometryRevision,ringArea,triangulateDigitizationRoom,type DigitizationGeometryRevision} from '@haven/contracts';

const escape=(value:string)=>Array.from(value).filter(char=>char.codePointAt(0)!>=32||['\t','\n','\r'].includes(char)).join('').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]!));
const number=(value:number)=>String(Number(value.toFixed(6)));
const point=(p:{x:number;y:number})=>`${number(p.x)} ${number(-p.y)}`;
const path=(ring:readonly {x:number;y:number}[])=>`M ${ring.map(point).join(' L ')} Z`;

/** Private deterministic derivative; authorization/review and storage belong to the caller. */
export function renderPlanSvg(input:DigitizationGeometryRevision,floorId:string):string{
 const geometry=digitizationGeometryRevision.parse(input);
 const floor=geometry.floors.find(f=>f.id===floorId);
 if(!floor)throw new Error('PLAN_FLOOR_NOT_FOUND');
 const rooms=geometry.rooms.filter(r=>r.floorId===floorId),walls=geometry.walls.filter(w=>w.floorId===floorId);
 const points=[...rooms.flatMap(r=>r.polygon),...walls.flatMap(w=>[w.start,w.end])];
 if(!points.length)throw new Error('PLAN_FLOOR_EMPTY');
 const minimumX=Math.min(...points.map(p=>p.x)),maximumX=Math.max(...points.map(p=>p.x)),minimumY=Math.min(...points.map(p=>p.y)),maximumY=Math.max(...points.map(p=>p.y));
 const extent=Math.max(maximumX-minimumX,maximumY-minimumY);
 if(extent<=0)throw new Error('PLAN_FLOOR_EMPTY');
 const padding=Math.max(extent*.04,...walls.map(w=>Number(w.thickness))),fontSize=extent*.025;
 const width=maximumX-minimumX+2*padding,height=maximumY-minimumY+2*padding+fontSize*3;
 const metric=geometry.unit==='m'&&['measured','estimated'].includes(geometry.scaleStatus);
 const scaleLabel=geometry.scaleStatus==='unscaled'?'Unscaled trace':geometry.scaleStatus==='legacy_supplied_unverified'?'Supplied dimensions; unverified':geometry.scaleStatus==='estimated'?'Estimated scale':'Measured scale anchors';
 const title=`${floor.name} — ${scaleLabel}${geometry.review.status==='confirmed'?'':' — Draft'}`;
 const output=[`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${Math.max(1,Math.round(1200*height/width))}" viewBox="${number(minimumX-padding)} ${number(-maximumY-padding-fontSize*3)} ${number(width)} ${number(height)}" role="img" aria-label="${escape(title)}">`,`<title>${escape(title)}</title>`,`<rect x="${number(minimumX-padding)}" y="${number(-maximumY-padding-fontSize*3)}" width="${number(width)}" height="${number(height)}" fill="#fff"/>`,`<g fill="#ecf3ef" stroke="#185b48" stroke-width="${number(extent*.002)}">`];
 for(const room of rooms)output.push(`<path data-room-id="${escape(room.id)}" d="${[room.polygon,...room.holes].map(path).join(' ')}" fill-rule="evenodd"/>`);
 output.push('</g>','<g stroke="#202c29" stroke-linecap="butt">');
 for(const wall of walls){
  const length=Math.hypot(wall.end.x-wall.start.x,wall.end.y-wall.start.y),dx=(wall.end.x-wall.start.x)/length,dy=(wall.end.y-wall.start.y)/length;
  // Opening spans are drawn only after explicit confirmation; no invented doors.
  const openings=geometry.openings.filter(o=>o.wallId===wall.id&&o.confirmed).sort((a,b)=>Number(a.offset)-Number(b.offset));
  let offset=0;
  const line=(start:number,end:number)=>{if(end>start)output.push(`<line data-wall-id="${escape(wall.id)}" x1="${number(wall.start.x+dx*start)}" y1="${number(-wall.start.y-dy*start)}" x2="${number(wall.start.x+dx*end)}" y2="${number(-wall.start.y-dy*end)}" stroke-width="${escape(wall.thickness)}"${wall.confirmed?'':` stroke-dasharray="${number(extent*.012)} ${number(extent*.006)}"`}/>`);};
  for(const opening of openings){line(offset,Number(opening.offset));offset=Math.max(offset,Number(opening.offset)+Number(opening.width));}
  line(offset,length);
 }
 output.push('</g>',`<g fill="#202c29" font-family="sans-serif" font-size="${number(fontSize)}" text-anchor="middle">`);
 for(const room of rooms){
  const triangles=triangulateDigitizationRoom(room.polygon,room.holes);
  let largest=-1,center=room.polygon[0];
  for(let i=0;i<triangles.indices.length;i+=3){
   const vertices=triangles.indices.slice(i,i+3).map(index=>triangles.vertices[index]),area=ringArea(vertices);
   if(area>largest){largest=area;center={x:vertices.reduce((sum,p)=>sum+p.x,0)/3,y:vertices.reduce((sum,p)=>sum+p.y,0)/3};}
  }
  // Geometry net area is a drawing diagnostic, never an official inventory fact.
  const area=ringArea(room.polygon)-room.holes.reduce((sum,hole)=>sum+ringArea(hole),0);
  const label=room.name+(metric?` (${area.toFixed(2)} m² net${geometry.scaleStatus==='estimated'?'; estimated':''})`:'');
  output.push(`<text data-room-label="${escape(room.id)}" x="${number(center.x)}" y="${number(-center.y)}" direction="auto">${escape(label)}</text>`);
 }
 output.push(`<text x="${number((minimumX+maximumX)/2)}" y="${number(-maximumY-padding-fontSize)}">${escape(title)}</text>`,'</g>','</svg>');
 return output.join('');
}
export async function renderPlanPng(geometry:DigitizationGeometryRevision,floorId:string,maxEdge=2048){
 if(!Number.isInteger(maxEdge)||maxEdge<128||maxEdge>2048)throw new Error('PLAN_RASTER_BUDGET_INVALID');
 return sharp(Buffer.from(renderPlanSvg(geometry,floorId)),{limitInputPixels:30_000_000}).resize({width:maxEdge,height:maxEdge,fit:'inside',withoutEnlargement:true}).png().toBuffer();
}
