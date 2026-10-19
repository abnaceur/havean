import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {fail} from '../../platform/core.js';
export type PrivacyRectangle={x:number;y:number;width:number;height:number};
/** Mask canonical decoder pixels before any reconstruction consumer reads them.
 * The supplied rectangles are annotations, not a claim of complete detection.
 */
export async function maskTrainingFrame(source:Buffer,regions:readonly PrivacyRectangle[]){
 if(!source.length||source.length>16*1024*1024||regions.length>20)fail(422,'Frame privacy input exceeds its budget.','FRAME_PRIVACY_INVALID');
 const image=sharp(source,{limitInputPixels:1600*1600,failOn:'warning'}),meta=await image.metadata();
 if(meta.format!=='png'||!meta.width||!meta.height||meta.width>1600||meta.height>1600||meta.exif||meta.xmp||meta.iptc)fail(422,'Use bounded metadata-free upright frame PNGs.','FRAME_PRIVACY_INVALID');
 const {width,height}=meta,overlay=Buffer.alloc(width*height*4);
 for(const box of regions){
  if(![box.x,box.y,box.width,box.height].every(Number.isInteger)||box.x<0||box.y<0||box.width<1||box.height<1||box.x+box.width>width||box.y+box.height>height)fail(422,'Mask rectangles must fit the actual frame.','FRAME_PRIVACY_INVALID');
  for(let y=box.y;y<box.y+box.height;y++)for(let x=box.x;x<box.x+box.width;x++)overlay[(y*width+x)*4+3]=255;
 }
 const body=await image.composite([{input:overlay,raw:{width,height,channels:4},blend:'over'}]).png().toBuffer();
 return {body,width,height,sourceSha256:createHash('sha256').update(source).digest('hex'),sha256:createHash('sha256').update(body).digest('hex')};
}
/** Stable archive names are chosen by the API, never supplied paths. */
export function trainingFrameTar(entries:readonly {name:string;body:Buffer}[]){
 if(entries.length>601||new Set(entries.map(e=>e.name)).size!==entries.length)fail(422,'Invalid training archive entries.','FRAME_PRIVACY_INVALID');
 const chunks:Buffer[]=[];let total=1024;
 for(const entry of entries){
  if(!/^(manifest\.json|frames\/[a-f0-9-]{36}\.png)$/.test(entry.name))fail(422,'Invalid training archive path.','FRAME_PRIVACY_INVALID');
  const padding=(512-entry.body.length%512)%512;total+=512+entry.body.length+padding;
  if(total>384*1024*1024)fail(422,'Training archive exceeds its private budget.','FRAME_PRIVACY_BUDGET_EXCEEDED');
  const header=Buffer.alloc(512),octal=(value:number,length:number)=>value.toString(8).padStart(length-1,'0')+'\0';
  header.write(entry.name,0,100,'ascii');header.write(octal(0o600,8),100);header.write(octal(0,8),108);header.write(octal(0,8),116);header.write(octal(entry.body.length,12),124);header.write(octal(0,12),136);header.fill(32,148,156);header.write('0',156);header.write('ustar\0',257);header.write('00',263);
  const checksum=header.reduce((sum,byte)=>sum+byte,0);header.write(checksum.toString(8).padStart(6,'0')+'\0 ',148);
  chunks.push(header,entry.body,Buffer.alloc(padding));
 }
 return Buffer.concat([...chunks,Buffer.alloc(1024)],total);
}
