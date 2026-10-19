import type pg from 'pg';
import type {Actor} from '@haven/database';
import {fail} from '../../platform/core.js';
import {acquireGpuLease,renewGpuLease} from './gpu-leases.js';
export async function acquireTrainingGpu(c:pg.PoolClient,a:Actor,engine:string,stage:string,execution:string,fence:string){
 try{return await acquireGpuLease(c,a,engine,stage,execution,fence);}catch(e:any){if(e.getResponse?.()?.code==='GPU_RESOURCE_UNAVAILABLE')fail(429,'The scene training resource is busy.','GPU_RESOURCE_UNAVAILABLE');throw e;}
}
export async function currentTrainingGpu(c:pg.PoolClient,stage:string,execution:string,fence:string){
 const row=(await c.query('SELECT * FROM digitization_training_gpu_reservation($1,$2,$3)',[stage,execution,fence])).rows[0];
 if(!row||new Date(row.lease_until).getTime()<=Date.now())fail(409,'The exclusive training resource lease expired.','GPU_RESOURCE_STALE');return row;
}
export async function renewTrainingGpu(c:pg.PoolClient,a:Actor,engine:string,stage:string,execution:string,fence:string){const slot=await currentTrainingGpu(c,stage,execution,fence);return renewGpuLease(c,a,engine,stage,execution,fence,slot.slot_id,slot.slot_fence);}
/** Must follow a concrete processStopped receipt or a successful stop/purge. */
export async function releaseStoppedTrainingGpu(c:pg.PoolClient,stage:string,execution:string,fence:string){if(!(await c.query('SELECT digitization_release_stopped_training_gpu($1,$2,$3) released',[stage,execution,fence])).rows[0].released)fail(409,'Training termination scope changed.','GPU_RELEASE_UNCONFIRMED');}
