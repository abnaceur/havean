import {readFile} from 'node:fs/promises';
import type {DigitizationFactCandidate} from '@haven/contracts';
import {env} from '../../platform/core.js';

type Candidate=Pick<DigitizationFactCandidate,'id'|'field'|'rawText'|'normalizedValue'|'evidence'>;
export type StructuredSuggestionReceipt={state:'disabled'|'unavailable'|'rejected'|'validated';providerSha256:string|null;candidateIds:string[];reviewRequired:true};
/** Optional private model service selects already grounded candidates. It cannot
 * add facts, change values/evidence, decide reviews or execute commands. The API
 * owns the fixed destination and credentials; production admission is separate. */
export async function structuredSuggestions(candidates:readonly Candidate[],locale:'en'|'fr'|'ar',signal?:AbortSignal):Promise<StructuredSuggestionReceipt>{
 const receipt=(state:StructuredSuggestionReceipt['state'],providerSha256:string|null=null,candidateIds:string[]=[]):StructuredSuggestionReceipt=>({state,providerSha256,candidateIds,reviewRequired:true});
 if(process.env.DIGITIZATION_STRUCTURED_PROVIDER_ENABLED!=='true')return receipt('disabled');
 if(env.NODE_ENV==='production'||!(env.NODE_ENV==='development'||process.env.HAVEN_CONTAINER_TESTS==='true'))return receipt('unavailable');
 const origin=process.env.DIGITIZATION_STRUCTURED_PROVIDER_ORIGIN,profile=process.env.DIGITIZATION_STRUCTURED_PROVIDER_SHA256,keyFile=process.env.DIGITIZATION_STRUCTURED_PROVIDER_KEY_FILE;
 if(!origin||!profile||!/^[a-f0-9]{64}$/.test(profile)||!keyFile||candidates.length>1000)return receipt('unavailable');
 let endpoint:URL;
 try{endpoint=new URL(origin);if(endpoint.protocol!=='http:'||endpoint.username||endpoint.password||endpoint.pathname!=='/'||endpoint.search||endpoint.hash||!(endpoint.hostname==='structured-model'&&endpoint.port==='8021'||process.env.HAVEN_CONTAINER_TESTS==='true'&&endpoint.hostname==='127.0.0.1'))return receipt('unavailable');}catch{return receipt('unavailable');}
 const choices=candidates.map(({id,field,rawText,normalizedValue,evidence})=>({id,field,rawText,normalizedValue,evidence}));
 const body=JSON.stringify({schemaVersion:1,providerSha256:profile,locale,candidates:choices});
 if(Buffer.byteLength(body)>131072)return receipt('unavailable',profile);
 try{
  const key=await readFile(keyFile);if(key.length<32||key.length>256)return receipt('unavailable',profile);
  signal?.throwIfAborted();
  const response=await fetch(new URL('/v1/structured-proposals',endpoint),{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key.toString('base64')},body,signal:signal?AbortSignal.any([signal,AbortSignal.timeout(3000)]):AbortSignal.timeout(3000)});
  if(!response.ok||!response.body||response.headers.get('Content-Type')?.split(';')[0]!=='application/json'){await response.body?.cancel();return receipt('unavailable',profile);}
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>65536)return receipt('rejected',profile);chunks.push(part.value);}}finally{await reader.cancel();reader.releaseLock();}
  let result;try{result=JSON.parse(Buffer.concat(chunks).toString());}catch{return receipt('rejected',profile);}
  if(!result||typeof result!=='object'||Array.isArray(result)||Object.keys(result).sort().join(',')!=='candidateIds,providerSha256,schemaVersion'||result.schemaVersion!==1||result.providerSha256!==profile||!Array.isArray(result.candidateIds)||result.candidateIds.length>candidates.length||new Set(result.candidateIds).size!==result.candidateIds.length||result.candidateIds.some((id:unknown)=>typeof id!=='string'||!candidates.some(candidate=>candidate.id===id)))return receipt('rejected',profile);
  return receipt('validated',profile,result.candidateIds);
 }catch{return receipt('unavailable',profile);}
}
