import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {login} from '../support/browser';
const requireApi=createRequire(new URL('../../apps/api/package.json',import.meta.url));
const sharp=requireApi('sharp');
const pg=requireApi('pg');
const {S3Client,GetObjectCommand}=requireApi('@aws-sdk/client-s3');
const environment=Object.fromEntries(readFileSync(process.env.HAVEN_ENV_FILE||'.env','utf8').trim().split('\n').map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)];}));
test('F12 sanitizes image variants and denies unsigned access to originals',async({page,browser})=>{
 await login(page,'owner');
 const image=await sharp({create:{width:2600,height:1800,channels:3,background:'#729394'}}).withExif({IFD0:{Artist:'PRIVATE_EXIF_FIXTURE'},IFD2:{UserComment:'PRIVATE_EXIF_CONTACT'}}).jpeg().toBuffer();
 const intent=await page.request.post('/api/v1/media/upload-intents',{headers:{Origin:'http://localhost:8088'},data:{mime:'image/jpeg',size:image.length,rights:'Project-created synthetic image',visibility:'public',purpose:'photo'}});
 expect(intent.status()).toBe(201);const asset=(await intent.json()).data;
 const upload=await page.request.put(asset.uploadUrl,{headers:{Origin:'http://localhost:8088','Content-Type':'image/jpeg'},data:image});expect(upload.status()).toBe(200);
 const display=await page.request.get('/api/v1/media/'+asset.id+'/view');expect(display.status()).toBe(200);
 const metadata=await sharp(await display.body()).metadata();expect(metadata.format).toBe('webp');expect(metadata.width).toBeLessThanOrEqual(2000);expect(metadata.height).toBeLessThanOrEqual(1600);expect(metadata.exif).toBeUndefined();expect(metadata.xmp).toBeUndefined();
 const pool=new pg.Pool({connectionString:environment.MIGRATION_DATABASE_URL});
 try{
  const row=(await pool.query('SELECT object_key,variants FROM media_assets WHERE id=$1',[asset.id])).rows[0];
  const storage=environment.S3_ENDPOINT;
  const original=await page.request.get(storage+'/haven-private/quarantine/'+row.object_key);expect([401,403]).toContain(original.status());
  const thumbnail=await page.request.get(storage+'/haven-private/'+row.variants.thumbnail);expect([401,403]).toContain(thumbnail.status());
  const client=new S3Client({region:'us-east-1',endpoint:storage,forcePathStyle:true,credentials:{accessKeyId:environment.S3_ACCESS_KEY,secretAccessKey:environment.S3_SECRET_KEY},responseChecksumValidation:'WHEN_REQUIRED'});
  try{const stored=await client.send(new GetObjectCommand({Bucket:'haven-private',Key:row.variants.thumbnail}));const thumb=await sharp(Buffer.from(await stored.Body.transformToByteArray())).metadata();expect(thumb.width).toBe(480);expect(thumb.format).toBe('webp');expect(thumb.exif).toBeUndefined();}finally{client.destroy();}
 }finally{await pool.end();}
 const anonymous=await browser.newContext();try{expect((await anonymous.request.get('http://localhost:8088/api/v1/media/'+asset.id+'/view')).status()).toBe(404);}finally{await anonymous.close();}
 const forged=await page.request.put(asset.uploadUrl.replace(/signature=.*/, 'signature=forged'),{headers:{Origin:'http://localhost:8088','Content-Type':'image/jpeg'},data:image});expect(forged.status()).toBe(400);
});
