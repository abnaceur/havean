import {GetObjectCommand,HeadObjectCommand,type S3Client} from '@aws-sdk/client-s3';
import {createHash} from 'node:crypto';
import {fail} from '../../platform/core.js';
import {captureClipBytes} from './multipart.js';

/** Container declaration only. It is not a codec/decoder approval. Unknown/legacy
 * containers require a separately tested profile; never infer video from MIME alone.
 */
function containerMime(prefix:Buffer){
 if(prefix.length<16||!prefix.subarray(4,8).equals(Buffer.from('ftyp')))fail(422,'Capture has no supported container declaration.','CAPTURE_MIME_INVALID');
 const length=prefix.readUInt32BE(0);
 if(length<16||length>prefix.length||length%4!==0)fail(422,'Capture container declaration is invalid.','CAPTURE_MIME_INVALID');
 const brands=[prefix.subarray(8,12).toString('latin1')];
 for(let offset=16;offset<length;offset+=4)brands.push(prefix.subarray(offset,offset+4).toString('latin1'));
 if(brands.includes('qt  '))return 'video/quicktime';
 if(brands.some(brand=>['isom','iso2','mp41','mp42','avc1'].includes(brand)))return 'video/mp4';
 fail(422,'Capture container requires an unsupported profile.','CAPTURE_MIME_INVALID');
}
/** Bounded streaming transfer outside SQL. Originals remain private and pending
 * independent malware/ffprobe gates, even when this integrity check succeeds.
 */
export async function verifyCaptureContent(client:S3Client,key:string,expectedBytes:number,mime:string,expectedChecksum:string,signal=AbortSignal.timeout(120000)){
 if(!Number.isSafeInteger(expectedBytes)||expectedBytes<16||expectedBytes>captureClipBytes||!/^[a-f0-9]{64}$/.test(expectedChecksum))fail(422,'Invalid capture integrity bounds.','CAPTURE_OBJECT_MISMATCH');
 const head=await client.send(new HeadObjectCommand({Bucket:'haven-private',Key:key}),{abortSignal:signal});
 if(head.ContentLength!==expectedBytes)fail(422,'Stored capture size does not match.','CAPTURE_OBJECT_MISMATCH');
 const result=await client.send(new GetObjectCommand({Bucket:'haven-private',Key:key}),{abortSignal:signal});
 if(!result.Body||result.ContentLength!==expectedBytes){(result.Body as any)?.destroy?.();fail(422,'Stored capture size changed.','CAPTURE_OBJECT_MISMATCH');}
 let bytes=0;const hash=createHash('sha256'),prefix:Buffer[]=[];let prefixBytes=0;
 try{for await(const chunk of result.Body as AsyncIterable<Uint8Array>){bytes+=chunk.byteLength;if(bytes>expectedBytes)fail(413,'Capture exceeds its intent.','CAPTURE_TOO_LARGE');hash.update(chunk);if(prefixBytes<4096){const part=Buffer.from(chunk.subarray(0,4096-prefixBytes));prefix.push(part);prefixBytes+=part.length;}}}finally{(result.Body as any)?.destroy?.();}
 const checksum=hash.digest('hex');
 if(bytes!==expectedBytes||checksum!==expectedChecksum)fail(422,'Stored capture checksum does not match.','CAPTURE_OBJECT_MISMATCH');
 const detectedMime=containerMime(Buffer.concat(prefix,prefixBytes));
 if(detectedMime!==mime)fail(422,'Stored capture container differs from its declared MIME.','CAPTURE_MIME_INVALID');
 return {checksum,bytes,detectedMime};
}
