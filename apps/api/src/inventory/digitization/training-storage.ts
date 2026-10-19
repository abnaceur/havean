import {createHash} from 'node:crypto';
import {GetObjectCommand,PutObjectCommand} from '@aws-sdk/client-s3';
import {fail} from '../../platform/core.js';
import {captureStorage} from './multipart.js';
export async function readTrainingBytes(row:{object_key:string;checksum:string;byte_size:string},engine:string,signal=AbortSignal.timeout(20000)){
 if(!row.object_key.startsWith(`digitization/${engine}/`)||row.object_key.split('/').some(p=>p==='.'||p==='..')||!/^[a-f0-9]{64}$/.test(row.checksum)||!/^[1-9]\d{0,8}$/.test(row.byte_size)||BigInt(row.byte_size)>402653184n)fail(422,'Invalid private training descriptor.','TRAINING_BYTES_INVALID');
 const storage=captureStorage();try{
  const object=await storage.send(new GetObjectCommand({Bucket:'haven-private',Key:row.object_key}),{abortSignal:signal});
  if(!object.Body||String(object.ContentLength)!==row.byte_size){(object.Body as any)?.destroy?.();fail(422,'Private training storage changed.','TRAINING_BYTES_INVALID');}
  const chunks:Buffer[]=[];let size=0;const hash=createHash('sha256');
  for await(const chunk of object.Body as AsyncIterable<Uint8Array>){size+=chunk.byteLength;if(size>Number(row.byte_size)){(object.Body as any).destroy?.();fail(422,'Private training storage exceeds its bound.','TRAINING_BYTES_INVALID');}chunks.push(Buffer.from(chunk));hash.update(chunk);}
  if(String(size)!==row.byte_size||hash.digest('hex')!==row.checksum)fail(422,'Private training storage changed.','TRAINING_BYTES_INVALID');return Buffer.concat(chunks,size);
 }finally{storage.destroy();}
}
export async function storeTrainingBytes(engine:string,key:string,body:Buffer,mime:string,signal:AbortSignal){
 const checksum=createHash('sha256').update(body).digest('hex'),storage=captureStorage();
 try{try{await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:key,Body:body,ContentType:mime,IfNoneMatch:'*'}),{abortSignal:signal});}catch(e:any){if(e.$metadata?.httpStatusCode!==412)throw e;}}
 finally{storage.destroy();}
 await readTrainingBytes({object_key:key,checksum,byte_size:String(body.length)},engine,signal);return checksum;
}
