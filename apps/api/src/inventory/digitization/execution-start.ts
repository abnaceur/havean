import {readFile} from 'node:fs/promises';
import type {Actor} from '@haven/database';
import {fail,transaction,env} from '../../platform/core.js';
import {prepareCpuExecution} from './execution-scope.js';
import {renewStageLease} from './leases.js';
import {verifySmallDigitizationSource} from './source-validation.js';
import {CpuRunnerClient} from './runner-client.js';
import {tryReuseCpuRenders} from './render-reuse.js';
import {completedCpuRenderReceipt} from './execution-results.js';

export async function configuredCpuRunner(){
 const origin=process.env.DIGITIZATION_CPU_RUNNER_ORIGIN,keyFile=process.env.DIGITIZATION_CPU_SIGNING_KEY_FILE;
 if(!origin||!keyFile)fail(503,'CPU processing is unavailable.','CPU_RUNNER_UNAVAILABLE');
 try{const key=await readFile(keyFile);if(key.length<32||key.length>256||[env.SESSION_KEY,process.env.DIGITIZATION_COORDINATOR_KEY].some(value=>typeof value==='string'&&(key.equals(Buffer.from(value))||/^[a-f0-9]{64}$/.test(value)&&key.equals(Buffer.from(value,'hex')))))throw Error('Invalid separate key');return new CpuRunnerClient(origin,key);}catch{fail(503,'CPU processing is unavailable.','CPU_RUNNER_UNAVAILABLE');}
}
/** The initiating actor/current lease is checked before transfer, before submitting
 * bytes and after runner acknowledgement. No SQL transaction spans storage/runner
 * work. A revoked/stale execution is cancelled; it cannot acquire a commit grant.
 */
async function startCurrentCpuExecution(a:Actor,engine:string,stageId:string,executionId:string,fencingToken:string,assetId:string,client:CpuRunnerClient){
 const completed=await completedCpuRenderReceipt(a,engine,stageId,executionId,fencingToken,assetId);
 if(completed)return {executionId,state:completed.state};
 const request=await transaction(a,c=>prepareCpuExecution(c,a,engine,stageId,executionId,fencingToken,assetId));
 const binding=await transaction(a,async c=>{
  await prepareCpuExecution(c,a,engine,stageId,executionId,fencingToken,assetId);
  return (await c.query('SELECT asset_version,purpose FROM digitization_asset_bindings WHERE digitization_id=$1 AND input_revision=$2 AND asset_id=$3',[engine,request.inputRevision,assetId])).rows[0];
 });
 if(!binding)fail(404,'Current processing source not found.','SOURCE_NOT_FOUND');
 const source=await verifySmallDigitizationSource(a,engine,assetId,binding.asset_version,request.inputRevision,binding.purpose);
 if(source.sha256!==request.artifacts[0].checksum||String(source.bytes)!==request.artifacts[0].byteSize||source.detectedMime!==request.artifacts[0].detectedMime)fail(409,'Stored source changed after its input snapshot.','SOURCE_CONTENT_CHANGED');
 await transaction(a,c=>prepareCpuExecution(c,a,engine,stageId,executionId,fencingToken,assetId));
 const reused=await tryReuseCpuRenders(a,engine,request,assetId);if(reused)return {executionId,state:reused.state};
 let state;
 try{state=await client.submit(request,source.body);}catch{fail(503,'CPU execution transfer failed; retry this execution.','CPU_RUNNER_TRANSFER_FAILED');}
 try{await transaction(a,c=>renewStageLease(c,a,engine,stageId,executionId,fencingToken));}
 catch(error){await client.cancel(request).catch(()=>undefined);throw error;}
 // Results and private preview paths belong to a separately guarded commit port.
 return {executionId:state.executionId,state:state.state};
}

export async function startCpuExecution(a:Actor,engine:string,stageId:string,executionId:string,fencingToken:string,assetId:string,client:CpuRunnerClient){
 try{return await startCurrentCpuExecution(a,engine,stageId,executionId,fencingToken,assetId,client);}
 catch(error:any){if(error.status===409){const completed=await completedCpuRenderReceipt(a,engine,stageId,executionId,fencingToken,assetId);if(completed)return {executionId,state:completed.state};}throw error;}
}
