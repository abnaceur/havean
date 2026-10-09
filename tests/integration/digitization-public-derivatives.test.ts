import '../support/env';
import {afterAll,expect,it} from 'vitest';
import {createRequire} from 'node:module';
import type {FastifyRequest} from 'fastify';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {MediaController} from '../../apps/api/src/inventory/media';
import {captureStorage} from '../../apps/api/src/inventory/digitization/multipart';
import type {Identity} from '../../apps/api/src/platform/core';
const requireApi=createRequire(new URL('../../apps/api/package.json',import.meta.url)),sharp=requireApi('sharp'),{GetObjectCommand,DeleteObjectCommand}=requireApi('@aws-sdk/client-s3');
const actor:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']};
afterAll(()=>pool.end());
it('HE-B06 actual scanned public photo variants omit source GPS EXIF and private location metadata',async()=>{
 const bytes=await sharp({create:{width:32,height:24,channels:3,background:'#185b48'}}).jpeg().withExif({IFD0:{ImageDescription:'SYNTHETIC_PRIVATE_LOCATION'},IFD3:{GPSLatitudeRef:'N',GPSLatitude:'24/1 0/1 0/1',GPSLongitudeRef:'E',GPSLongitude:'54/1 0/1 0/1'}}).toBuffer();
 const exif=(await sharp(bytes).metadata()).exif as Buffer;
 expect(exif.includes(Buffer.from('SYNTHETIC_PRIVATE_LOCATION'))).toBe(true);
 const base=6,ifd=base+exif.readUInt32LE(base+4),tags=Array.from({length:exif.readUInt16LE(ifd)},(_,i)=>exif.readUInt16LE(ifd+2+i*12));expect(tags).toContain(0x8825);
 const media=new MediaController({actor:async()=>actor} as unknown as Identity),storage=captureStorage();let keys:string[]=[];
 try{
  const intent=(await media.intent({} as FastifyRequest,{mime:'image/jpeg',size:bytes.length,rights:'Synthetic GPS metadata stripping fixture',visibility:'public',purpose:'photo'})).data;
  const signature=new URL(intent.uploadUrl,'http://localhost').searchParams.get('signature');
  const approved=await media.content({headers:{'content-type':'image/jpeg'},query:{signature}} as unknown as FastifyRequest,intent.id,bytes);expect(approved.data.status).toBe('approved');
  const asset=await transaction(actor,async c=>(await c.query('SELECT object_key,variants FROM media_assets WHERE id=$1',[intent.id])).rows[0]);keys=['quarantine/'+asset.object_key,...Object.values(asset.variants) as string[]];
  expect(Object.keys(asset.variants).sort()).toEqual(['display','thumbnail']);
  for(const key of Object.values(asset.variants) as string[]){
   const stored=await storage.send(new GetObjectCommand({Bucket:'haven-private',Key:key})),body=Buffer.from(await stored.Body!.transformToByteArray()),metadata=await sharp(body).metadata();
   expect(metadata.format).toBe('webp');expect(metadata.exif).toBeUndefined();expect(metadata.xmp).toBeUndefined();expect(metadata.iptc).toBeUndefined();expect(body.includes(Buffer.from('SYNTHETIC_PRIVATE_LOCATION'))).toBe(false);
  }
 }finally{for(const key of keys)await storage.send(new DeleteObjectCommand({Bucket:'haven-private',Key:key}));storage.destroy();}
});
