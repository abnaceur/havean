import {createHash,createHmac} from 'node:crypto';
import {digitizationExecutionRequest,type DigitizationExecutionRequest,isGsplatTrainingProfile} from '@haven/contracts';

function canonical(value:unknown):unknown{return Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,item])=>[key,canonical(item)])):value;}
export function executionRequestDigest(request:DigitizationExecutionRequest){return createHash('sha256').update(JSON.stringify(canonical(digitizationExecutionRequest.parse(request)))).digest('hex');}
/** Transport credential only. The API caller must already hold a checked current stage lease
 * and explicit source-processing authority. It never confers publication privileges.
 */
export function executionGrant(request:DigitizationExecutionRequest,key:Buffer,actions:readonly ('submit'|'source'|'read'|'cancel'|'preview'|'purge')[],now=Date.now()){
 if(key.length<32||!actions.length||new Set(actions).size!==actions.length||actions.some(action=>!['submit','source','read','cancel','preview','purge'].includes(action))||!Number.isSafeInteger(now))throw Error('RUNNER_CREDENTIAL_INVALID');
 const encoded=Buffer.from(JSON.stringify(canonical({aud:'haven-processing-v1',executionId:request.executionId,requestDigest:executionRequestDigest(request),expiresAt:Math.floor(now/1000)+120,actions}))).toString('base64url');
 return encoded+'.'+createHmac('sha256',key).update(encoded).digest('base64url');
}
export class CpuRunnerClient{
 constructor(private readonly origin:string,private readonly key:Buffer){
  const url=new URL(origin);
  if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||!['http:','https:'].includes(url.protocol)||key.length<32)throw Error('RUNNER_CONFIGURATION_INVALID');
 }
 private async call(request:DigitizationExecutionRequest,action:'submit'|'source'|'read'|'cancel'|'purge',suffix:string,body?:Buffer|string,mime='application/json'){
  const response=await fetch(this.origin.replace(/\/$/,'')+'/executions'+suffix,{method:action==='read'?'GET':'POST',headers:{Authorization:'Bearer '+executionGrant(request,this.key,[action]),...(body!==undefined?{'Content-Type':mime}:{})},...(body!==undefined?{body:typeof body==='string'?body:new Uint8Array(body)}:{}),signal:AbortSignal.timeout(action==='source'?20000:5000)});
  // Provider response text may contain private decoder output. Never put it in errors/logs.
  if(!response.ok)throw Error('RUNNER_REQUEST_FAILED_'+response.status);
  if(!response.body||response.headers.get('Content-Type')?.split(';')[0]!=='application/json')throw Error('RUNNER_RESPONSE_INVALID');
  const reader=response.body.getReader(),chunks:Buffer[]=[];let bytes=0;
  try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>16*1024*1024)throw Error('RUNNER_RESPONSE_BUDGET_EXCEEDED');chunks.push(Buffer.from(part.value));}}finally{await reader.cancel();reader.releaseLock();}
  let decoded:unknown;try{decoded=JSON.parse(Buffer.concat(chunks,bytes).toString('utf8'));}catch{throw Error('RUNNER_RESPONSE_INVALID');}
  const result=decoded as {data?:{executionId:string;state:string;result:unknown;errorCode:string|null;processStopped?:boolean;scratchPurged?:boolean}};
  if(!result||result.data?.executionId!==request.executionId||!['awaiting_source','pending','running','succeeded','failed_retryable','failed_terminal','cancelled'].includes(result.data.state))throw Error('RUNNER_RESPONSE_INVALID');
  return result.data;
 }
 async submit(request:DigitizationExecutionRequest,source:Buffer){
  const parsed=digitizationExecutionRequest.parse(request),asset=parsed.artifacts[0];
  if(parsed.artifacts.length!==1||source.length>(isGsplatTrainingProfile(parsed.profileId)?384:parsed.profileId==='private-colmap-cpu-investigation-v1'?384:asset.detectedMime==='application/pdf'||parsed.profileId==='private-panorama-candidate-v1'?20:10)*1024*1024||source.length!==Number(asset.byteSize)||createHash('sha256').update(source).digest('hex')!==asset.checksum)throw Error('RUNNER_SOURCE_MISMATCH');
  let state=await this.call(parsed,'submit','',JSON.stringify(parsed));
  if(state.state==='awaiting_source')state=await this.call(parsed,'source',`/${parsed.executionId}/sources/${asset.id}`,source,asset.detectedMime);
  return state;
 }
 read(request:DigitizationExecutionRequest){return this.call(request,'read','/'+request.executionId);}
 cancel(request:DigitizationExecutionRequest){return this.call(request,'cancel','/'+request.executionId+'/cancel',JSON.stringify(digitizationExecutionRequest.parse(request)));}
 async purge(request:DigitizationExecutionRequest){const until=Date.now()+17000;for(;;){try{const result=await this.call(request,'purge','/'+request.executionId+'/purge',JSON.stringify(digitizationExecutionRequest.parse(request)));if(result.processStopped!==true||result.scratchPurged!==true||result.state!=='cancelled'||result.result!==null)throw Error('RUNNER_PURGE_UNCONFIRMED');return result;}catch(error){if(!(error instanceof Error)||error.message!=='RUNNER_REQUEST_FAILED_409'||Date.now()>=until)throw error;}await new Promise(resolve=>setTimeout(resolve,100));}}
 async stop(request:DigitizationExecutionRequest){
  // Establish a durable tombstone even if cancellation wins before submission.
  await this.cancel(request);
  const until=Date.now()+17000;
  for(;;){const receipt=await this.read(request);if(receipt.processStopped===true&&['cancelled','succeeded','failed_terminal','failed_retryable'].includes(receipt.state))return;
   if(Date.now()>=until)throw Error('RUNNER_CANCELLATION_UNCONFIRMED');
   await new Promise(resolve=>setTimeout(resolve,100));
  }
 }
 async preview(request:DigitizationExecutionRequest,checksum:string){
  digitizationExecutionRequest.parse(request);
  if(!/^[a-f0-9]{64}$/.test(checksum))throw Error('RUNNER_PREVIEW_INVALID');
  const response=await fetch(this.origin.replace(/\/$/,'')+`/executions/${request.executionId}/previews/${checksum}`,{headers:{Authorization:'Bearer '+executionGrant(request,this.key,['preview'])},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('RUNNER_REQUEST_FAILED_'+response.status);
  if(!response.body||response.headers.get('Content-Type')!=='image/png')throw Error('RUNNER_PREVIEW_INVALID');
  const reader=response.body.getReader(),chunks:Buffer[]=[];let bytes=0;
  try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>32*1024*1024)throw Error('RUNNER_PREVIEW_BUDGET_EXCEEDED');chunks.push(Buffer.from(part.value));}}finally{await reader.cancel();reader.releaseLock();}
  const body=Buffer.concat(chunks,bytes);
  if(!body.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||createHash('sha256').update(body).digest('hex')!==checksum)throw Error('RUNNER_PREVIEW_INVALID');
  return body;
 }
 async trainingOutput(request:DigitizationExecutionRequest,output:{sha256:string;byteSize:string;mime:string}){
  digitizationExecutionRequest.parse(request);
  if(!isGsplatTrainingProfile(request.profileId)||!/^[a-f0-9]{64}$/.test(output.sha256)||!/^[1-9]\d{0,8}$/.test(output.byteSize)||BigInt(output.byteSize)>33554432n||!['application/octet-stream','application/x-ply','image/png'].includes(output.mime))throw Error('RUNNER_OUTPUT_INVALID');
  const response=await fetch(this.origin.replace(/\/$/,'')+`/executions/${request.executionId}/training-outputs/${output.sha256}`,{headers:{Authorization:'Bearer '+executionGrant(request,this.key,['preview'])},signal:AbortSignal.timeout(20000)});
  if(!response.ok||!response.body||response.headers.get('Content-Type')!==output.mime||response.headers.get('Content-Length')!==output.byteSize)throw Error('RUNNER_OUTPUT_INVALID');
  const reader=response.body.getReader(),chunks:Buffer[]=[];let size=0;
  try{for(;;){const p=await reader.read();if(p.done)break;size+=p.value.byteLength;if(size>Number(output.byteSize))throw Error('RUNNER_OUTPUT_BUDGET_EXCEEDED');chunks.push(Buffer.from(p.value));}}finally{await reader.cancel();reader.releaseLock();}
  const body=Buffer.concat(chunks,size);if(String(size)!==output.byteSize||createHash('sha256').update(body).digest('hex')!==output.sha256)throw Error('RUNNER_OUTPUT_INVALID');return body;
 }
 async trainingArchive(request:DigitizationExecutionRequest,checksum:string,byteSize:string){
  digitizationExecutionRequest.parse(request);
  if(request.profileId!=='private-colmap-cpu-investigation-v1'||!/^[a-f0-9]{64}$/.test(checksum)||!/^[1-9]\d{0,8}$/.test(byteSize)||BigInt(byteSize)>402653184n)throw Error('RUNNER_OUTPUT_INVALID');
  const response=await fetch(this.origin.replace(/\/$/,'')+`/executions/${request.executionId}/training-archives/${checksum}`,{headers:{Authorization:'Bearer '+executionGrant(request,this.key,['preview'])},signal:AbortSignal.timeout(20000)});
  if(!response.ok||!response.body||response.headers.get('Content-Type')!=='application/x-tar'||response.headers.get('Content-Length')!==byteSize)throw Error('RUNNER_OUTPUT_INVALID');
  const reader=response.body.getReader(),chunks:Buffer[]=[];let bytes=0;
  try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>Number(byteSize))throw Error('RUNNER_OUTPUT_BUDGET_EXCEEDED');chunks.push(Buffer.from(part.value));}}finally{await reader.cancel();reader.releaseLock();}
  const body=Buffer.concat(chunks,bytes);
  if(String(bytes)!==byteSize||createHash('sha256').update(body).digest('hex')!==checksum)throw Error('RUNNER_OUTPUT_INVALID');return body;
 }
}
