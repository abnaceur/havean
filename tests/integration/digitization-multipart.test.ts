import '../support/env';
import {expect,it} from 'vitest';
import {createHash} from 'node:crypto';
import {request} from 'node:http';
import {createRequire} from 'node:module';
const requireApi=createRequire(new URL('../../apps/api/package.json',import.meta.url));
const {CreateBucketCommand,DeleteObjectCommand,HeadObjectCommand,ListMultipartUploadsCommand}=requireApi('@aws-sdk/client-s3');
import {captureStorage,captureObjectKey,startCaptureMultipart,signCapturePart,captureParts,completeCaptureMultipart,hashCaptureObject,abortCaptureMultipart} from '../../apps/api/src/inventory/digitization/multipart';
it('HE-R03 real gateway presigned multipart resumes, validates authoritative parts/checksum and aborts abandoned work',async()=>{
 const storage=captureStorage(),signer=captureStorage('http://localhost:8089'),key=captureObjectKey(crypto.randomUUID()),abandoned=captureObjectKey(crypto.randomUUID());
 try{await storage.send(new CreateBucketCommand({Bucket:'haven-private'}));}catch(e:any){if(!['BucketAlreadyExists','BucketAlreadyOwnedByYou'].includes(e.name)&&e.$metadata?.httpStatusCode!==409)throw e;}
 const upload=await startCaptureMultipart(storage,key,'video/mp4'),orphan=await startCaptureMultipart(storage,abandoned,'video/mp4');
 async function part(n:number,body:Buffer){const url=new URL(await signCapturePart(signer,key,upload,n,body.length));const signedHost=url.host;url.hostname='proxy';const response=await new Promise<{status:number;body:string}>((resolve,reject)=>{const req=request(url,{method:'PUT',headers:{host:signedHost,'content-length':String(body.length)}},res=>{let text='';res.setEncoding('utf8');res.on('data',p=>{text+=p;});res.on('end',()=>resolve({status:res.statusCode||0,body:text}));});req.on('error',reject);req.end(body);});expect(response.status,response.body).toBe(200);}
 try{
  const a=Buffer.alloc(8*1024*1024,37),b=Buffer.alloc(1741,93);await part(1,a);
  // A new request/client after an interrupted browser discovers the persisted part.
  const resumed=await captureParts(captureStorage(),key,upload);expect(resumed.map(p=>[p.PartNumber,p.Size])).toEqual([[1,a.length]]);
  await expect(completeCaptureMultipart(storage,key,upload,a.length+1)).rejects.toMatchObject({status:422});await part(2,b);
  const result=await completeCaptureMultipart(storage,key,upload,a.length+b.length);expect(result.bytes).toBe(a.length+b.length);
  expect(await hashCaptureObject(storage,key,result.bytes)).toEqual({bytes:result.bytes,sha256:createHash('sha256').update(a).update(b).digest('hex')});
  await expect(hashCaptureObject(storage,key,result.bytes-1)).rejects.toMatchObject({status:413});
  const unsigned=await fetch('http://proxy:8089/haven-private/capture/'+crypto.randomUUID(),{method:'PUT',body:'forged'});expect(unsigned.status).toBe(403);
  await abortCaptureMultipart(storage,abandoned,orphan);const pending=await storage.send(new ListMultipartUploadsCommand({Bucket:'haven-private',Prefix:abandoned}));expect(pending.Uploads||[]).toHaveLength(0);
  await expect(storage.send(new HeadObjectCommand({Bucket:'haven-private',Key:abandoned}))).rejects.toMatchObject({$metadata:{httpStatusCode:404}});
 }finally{await Promise.allSettled([abortCaptureMultipart(storage,key,upload),abortCaptureMultipart(storage,abandoned,orphan),storage.send(new DeleteObjectCommand({Bucket:'haven-private',Key:key}))]);storage.destroy();signer.destroy();}
},60000);
