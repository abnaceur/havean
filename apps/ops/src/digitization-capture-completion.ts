/** Only bounded completion metadata crosses the BFF. Clip bytes use the existing
 * constrained signed multipart upload origin, never this JSON route.
 */
export async function forwardCaptureCompletion(req:Request,path:string){
 const requestId=crypto.randomUUID(),origin=process.env.PUBLIC_APP_URL||process.env.PUBLIC_WEB_URL||'http://localhost:8088';
 const error=(status:number,code:string,message:string)=>Response.json({error:{code,message,requestId}},{status,headers:{'X-Request-Id':requestId,'Cache-Control':'no-store'}});
 if(req.headers.get('origin')!==origin)return error(403,'CSRF_REJECTED','Untrusted request origin');
 if(req.headers.get('content-type')?.split(';')[0]!=='application/json')return error(415,'UNSUPPORTED_MEDIA_TYPE','Capture completion requires JSON metadata');
 const length=req.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>2048))return error(413,'PAYLOAD_TOO_LARGE','Capture completion metadata is too large');
 const reader=req.body?.getReader(),chunks:Uint8Array[]=[];let bytes=0;
 if(!reader)return error(422,'VALIDATION_ERROR','Capture completion metadata is required');
 const metadataSignal=AbortSignal.any([req.signal,AbortSignal.timeout(5000)]),abortMetadata=()=>{void reader.cancel().catch(()=>undefined);};
 metadataSignal.addEventListener('abort',abortMetadata,{once:true});
 try{if(metadataSignal.aborted)return error(400,'INCOMPLETE_REQUEST','Capture completion metadata was interrupted');for(;;){const part=await reader.read();if(metadataSignal.aborted)return error(400,'INCOMPLETE_REQUEST','Capture completion metadata was interrupted');if(part.done)break;bytes+=part.value.byteLength;if(bytes>2048)return error(413,'PAYLOAD_TOO_LARGE','Capture completion metadata is too large');chunks.push(part.value);}}
 catch{return error(400,'INCOMPLETE_REQUEST','Capture completion metadata was interrupted');}
 finally{metadataSignal.removeEventListener('abort',abortMetadata);await reader.cancel().catch(()=>undefined);reader.releaseLock();}
 const body=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
 const headers=new Headers();for(const key of ['cookie','origin','content-type','idempotency-key','x-organization-id']){const value=req.headers.get(key);if(value)headers.set(key,value);}headers.set('x-bff-origin',origin);
 try{
  const response=await fetch((process.env.API_INTERNAL_URL||'http://api:4000')+path,{method:'POST',headers,body,redirect:'manual',cache:'no-store',signal:AbortSignal.any([req.signal,AbortSignal.timeout(180000)])});
  const outgoing=new Headers({'Cache-Control':'no-store'});for(const key of ['content-type','x-request-id']){const value=response.headers.get(key);if(value)outgoing.set(key,value);}
  return new Response(response.body,{status:response.status,headers:outgoing});
 }catch{return error(503,'SERVICE_UNAVAILABLE','Capture completion is temporarily unavailable; retry with the same request key');}
}
