import {readFile} from 'node:fs/promises';
import {env,fail} from '../../platform/core.js';
import {CpuRunnerClient} from './runner-client.js';
export {gsplatTrainingProfile,gsplatExportProfile,isGsplatTrainingProfile} from '@haven/contracts';
/** Explicit local investigation only. No default activation or production admission. */
export function trainingAvailable(){return env.NODE_ENV!=='production'&&process.env.PROCESSING_ENABLE_GSPLAT_INVESTIGATION==='true'&&(env.NODE_ENV==='development'&&process.env.PROCESSING_DEPLOYMENT==='development'||process.env.HAVEN_CONTAINER_TESTS==='true'&&process.env.PROCESSING_DEPLOYMENT==='test')&&!!process.env.DIGITIZATION_GPU_RUNNER_ORIGIN&&!!process.env.DIGITIZATION_GPU_SIGNING_KEY_FILE;}
// Stop/purge must remain possible after the enable flag is removed.
export async function configuredGpuRunner(){
 const origin=process.env.DIGITIZATION_GPU_RUNNER_ORIGIN,path=process.env.DIGITIZATION_GPU_SIGNING_KEY_FILE;
 if(!origin||!path)fail(503,'Scene training is unavailable.','GPU_RUNNER_UNAVAILABLE');
 try{const key=await readFile(path),cpuPath=process.env.DIGITIZATION_CPU_SIGNING_KEY_FILE,cpu=cpuPath?await readFile(cpuPath):null;
  if(key.length<32||key.length>256||cpu?.equals(key)||[env.SESSION_KEY,process.env.DIGITIZATION_COORDINATOR_KEY].some(value=>typeof value==='string'&&(key.equals(Buffer.from(value))||/^[a-f0-9]{64}$/.test(value)&&key.equals(Buffer.from(value,'hex')))))throw Error('Separate runner key required');
  return new CpuRunnerClient(origin,key);
 }catch{fail(503,'Scene training is unavailable.','GPU_RUNNER_UNAVAILABLE');}
}
