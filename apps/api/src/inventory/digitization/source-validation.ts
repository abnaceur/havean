import {createHash} from 'node:crypto';
import type {Actor} from '@haven/database';
import {GetObjectCommand} from '@aws-sdk/client-s3';
import sharp from 'sharp';
import {fail,transaction} from '../../platform/core.js';
import {checkedWorkspace} from './intakes.js';
import {captureStorage} from './multipart.js';
import {scanFile} from '../scanner.js';
export async function verifySmallDigitizationSource(a:Actor,engine:string,asset:string,assetVersion:number,inputRevision:number,purpose:'document'|'plan'|'photo'|'panorama'){
 const snapshot=await transaction(a,async c=>{await checkedWorkspace(c,engine);const row=(await c.query('SELECT * FROM digitization_source_descriptor($1,$2,$3,$4)',[engine,asset,assetVersion,inputRevision])).rows[0];if(!row)fail(404,'Scoped scanned source not found');return row;});
 const limit=snapshot.mime==='application/pdf'||purpose==='panorama'&&snapshot.purpose==='panorama'?20*1024*1024:10*1024*1024;
 if(!Number.isSafeInteger(Number(snapshot.size))||Number(snapshot.size)>limit||Number(snapshot.size)<1)fail(413,'Document or image exceeds the small-upload limit.','SOURCE_TOO_LARGE');
 if(!['image/jpeg','image/png','application/pdf'].includes(snapshot.mime)||snapshot.mime==='application/pdf'&&!['document','plan'].includes(purpose)||(snapshot.mime==='application/pdf'||purpose==='document')&&snapshot.visibility!=='private')fail(422,'Source type or evidence visibility does not match.','SOURCE_MIME_INVALID');
 // Object transfer and decoder work occur after the actor transaction commits.
 const storage=captureStorage();let body:Buffer;
 try{const result=await storage.send(new GetObjectCommand({Bucket:'haven-private',Key:'quarantine/'+snapshot.object_key}),{abortSignal:AbortSignal.timeout(60000)});if(!result.Body||result.ContentLength!==Number(snapshot.size)||result.ContentLength>limit){(result.Body as any)?.destroy?.();fail(422,'Stored object does not match its scanned upload.','SOURCE_OBJECT_MISMATCH');}let count=0;const chunks:Buffer[]=[];for await(const chunk of result.Body as AsyncIterable<Uint8Array>){count+=chunk.byteLength;if(count>limit){(result.Body as any).destroy?.();fail(413,'Source exceeds the small-upload limit.','SOURCE_TOO_LARGE');}chunks.push(Buffer.from(chunk));}if(count!==Number(snapshot.size))fail(422,'Stored source is incomplete.','SOURCE_OBJECT_MISMATCH');body=Buffer.concat(chunks,count);}finally{storage.destroy();}
 // scan_at alone cannot authenticate mutable object bytes. Scan the exact
 // bounded bytes that will be fingerprinted and transferred to the decoder.
 await scanFile(body);
 let detected:string,width:number|undefined,height:number|undefined;
 if(body.subarray(0,5).toString()==='%PDF-')detected='application/pdf';else{
  try{const metadata=await sharp(body,{limitInputPixels:30e6,failOn:'warning'}).metadata();detected=metadata.format==='jpeg'?'image/jpeg':metadata.format==='png'?'image/png':'unsupported';width=metadata.width;height=metadata.height;if(!width||!height||width*height>30e6)fail(422,'Source raster exceeds the processing budget.','SOURCE_RASTER_BUDGET');}catch(error:any){if(error.getStatus)throw error;fail(422,'Source is not a supported bounded image.','SOURCE_DECODE_INVALID');}
 }
 if(detected!==snapshot.mime)fail(422,'Detected source bytes do not match the declared MIME.','SOURCE_MIME_INVALID');
 await transaction(a,async c=>{await checkedWorkspace(c,engine);if(!(await c.query("SELECT digitization_asset_access($1,$2,$3,$4,'document_processing') allowed",[engine,asset,assetVersion,inputRevision])).rows[0].allowed)fail(403,'Source access changed during validation.','SOURCE_ACCESS_CHANGED');});
 return {assetId:asset,assetVersion,inputRevision,purpose,detectedMime:detected,bytes:body.length,sha256:createHash('sha256').update(body).digest('hex'),width,height,decoderState:detected==='application/pdf'?'requires_isolated_pdf_decoder' as const:'requires_isolated_image_decoder' as const,body};
}
