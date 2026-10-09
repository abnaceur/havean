import {digitizationGpuLeaseRecord} from '@haven/contracts';
import type {Actor} from '@haven/database';
import type pg from 'pg';
import {fail} from '../../platform/core.js';
import {requireDigitizationAgency,checkedWorkspace} from './intakes.js';
import {requireCurrentExecution} from './leases.js';
/** No slots are registered by default. These are scheduling reservations;
 * CUDA hardware/model availability remains an independently verified gate. */
export async function acquireGpuLease(c:pg.PoolClient,a:Actor,engine:string,stage:string,execution:string,fence:string){
 await requireCurrentExecution(c,a,engine,stage,execution,fence);
 const row=(await c.query('SELECT * FROM digitization_acquire_gpu($1,$2,$3::bigint)',[stage,execution,fence])).rows[0];
 if(!row)fail(409,'No compatible exclusive processing resource is available.','GPU_RESOURCE_UNAVAILABLE');return digitizationGpuLeaseRecord.parse({...row,lease_until:row.lease_until.toISOString()});
}
export async function renewGpuLease(c:pg.PoolClient,a:Actor,engine:string,stage:string,execution:string,fence:string,slot:string,slotFence:string){
 await requireCurrentExecution(c,a,engine,stage,execution,fence);
 const row=(await c.query('SELECT * FROM digitization_renew_gpu($1,$2,$3::bigint,$4,$5::bigint)',[stage,execution,fence,slot,slotFence])).rows[0];
 if(!row)fail(409,'The exclusive resource lease is stale.','GPU_RESOURCE_STALE');return digitizationGpuLeaseRecord.parse({...row,lease_until:row.lease_until.toISOString()});
}
export async function releaseGpuLease(c:pg.PoolClient,a:Actor,engine:string,stage:string,execution:string,fence:string,slot:string,slotFence:string){
 await requireDigitizationAgency(c,a);await checkedWorkspace(c,engine);
 const row=(await c.query('SELECT s.state,s.execution_id,s.fencing_token::text,r.created_by FROM processing_stages s JOIN processing_runs r ON r.id=s.run_id WHERE s.id=$1 AND s.digitization_id=$2',[stage,engine])).rows[0];
 if(!row||row.created_by!==a.id||row.execution_id!==execution||row.fencing_token!==fence||!['succeeded','cancelled'].includes(row.state))fail(409,'Termination must be confirmed before releasing this resource.','GPU_RELEASE_UNCONFIRMED');
 const released=(await c.query('SELECT digitization_release_gpu($1,$2,$3::bigint,$4,$5::bigint) released',[stage,execution,fence,slot,slotFence])).rows[0].released;if(!released)fail(409,'The exclusive resource lease is stale.','GPU_RESOURCE_STALE');return {released:true as const};
}
