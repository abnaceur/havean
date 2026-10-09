import '../support/env';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {afterAll,expect,it} from 'vitest';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {checkedWorkspace} from '../../apps/api/src/inventory/digitization/intakes';
import {createRunGraph,dispatchRunGraph} from '../../apps/api/src/inventory/digitization/workflow';
import {leaseStage,renewStageLease} from '../../apps/api/src/inventory/digitization/leases';
import {acquireGpuLease,renewGpuLease,releaseGpuLease} from '../../apps/api/src/inventory/digitization/gpu-leases';
import {requireRunBudget} from '../../apps/api/src/inventory/digitization/budgets';
import {requestRunCancellation} from '../../apps/api/src/inventory/digitization/cancellation';
import type {DigitizationRun} from '../../packages/contracts/src/index';
const fixture=JSON.parse(readFileSync('infra/generated/integration/plan-editor-conflicts.json','utf8')),actor:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']};
const pg=createRequire(new URL('../../apps/api/package.json',import.meta.url))('pg');
const admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL}),runs:string[]=[],slot=crypto.randomUUID(),profile='test-reservation-only-splat-v1';
afterAll(async()=>{for(const run of runs){await transaction(actor,async c=>{const row=(await c.query('SELECT version FROM processing_runs WHERE id=$1',[run])).rows[0];if(!row)return;const pending=await requestRunCancellation(c,actor,fixture.engineId,run,row.version);await c.query('SELECT digitization_close_cancellation($1,$2,$3)',[fixture.engineId,run,pending.version]);});}await admin.query('DELETE FROM digitization_gpu_slots WHERE id=$1',[slot]);await Promise.all([pool.end(),admin.end()]);});
async function graph(seconds=120,scratch='67108864'){
 const w=await transaction(actor,c=>checkedWorkspace(c,fixture.engineId)),stageId=crypto.randomUUID(),id=crypto.randomUUID(),input:DigitizationRun={schemaVersion:1,id,organizationId:actor.orgId!,creatorId:actor.id,target:w.target,inputRevision:w.inputRevision,state:'draft',version:1,stages:[{id:stageId,type:'splat_train',state:'pending',dependencies:[],profileId:profile,inputFingerprint:'a'.repeat(64),inputRevision:w.inputRevision,attempt:0,fencingToken:null,executionId:null,progress:null}],deadline:new Date(Date.now()+7200000).toISOString(),budget:{maxSeconds:seconds,maxScratchBytes:scratch}};
 await transaction(actor,c=>createRunGraph(c,actor,w.id,w.version,input,['scene']));runs.push(id);return {id,stageId};
}
it('HE-C08 real PostgreSQL exclusivity/fences quarantine an expired synthetic reservation without asserting a GPU device',async()=>{
 const graphs=await Promise.all([graph(),graph()]);const stages=await Promise.all(graphs.map(async g=>{await transaction(actor,c=>dispatchRunGraph(c,actor,fixture.engineId,g.id,1));return transaction(actor,c=>leaseStage(c,actor,fixture.engineId,g.stageId,2));}));
 await expect(transaction(actor,c=>acquireGpuLease(c,actor,fixture.engineId,stages[0].id,stages[0].execution_id,stages[0].fencing_token))).rejects.toMatchObject({status:409});
 await admin.query('INSERT INTO digitization_gpu_slots(id,resource_key,enabled,profiles) VALUES($1,$2,true,$3)',[slot,'synthetic-reservation-no-device-'+slot,[profile]]);
 const attempts=await Promise.allSettled(stages.map(s=>transaction(actor,c=>acquireGpuLease(c,actor,fixture.engineId,s.id,s.execution_id,s.fencing_token))));expect(attempts.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(attempts.find(r=>r.status==='rejected')).toMatchObject({reason:{status:409}});const index=attempts.findIndex(r=>r.status==='fulfilled'),winner=attempts[index];if(winner.status!=='fulfilled')throw Error('Missing exclusive reservation');const s=stages[index],lease=winner.value;expect(lease.slot_id).toBe(slot);
 expect((await transaction(actor,c=>acquireGpuLease(c,actor,fixture.engineId,s.id,s.execution_id,s.fencing_token))).fencing_token).toBe(lease.fencing_token);await transaction(actor,c=>renewStageLease(c,actor,fixture.engineId,s.id,s.execution_id,s.fencing_token));expect((await transaction(actor,c=>renewGpuLease(c,actor,fixture.engineId,s.id,s.execution_id,s.fencing_token,slot,lease.fencing_token))).slot_id).toBe(slot);
 await expect(transaction(actor,c=>renewGpuLease(c,actor,fixture.engineId,s.id,s.execution_id,s.fencing_token,slot,'999999'))).rejects.toMatchObject({status:409});await expect(transaction(actor,c=>releaseGpuLease(c,actor,fixture.engineId,s.id,s.execution_id,s.fencing_token,slot,lease.fencing_token))).rejects.toMatchObject({status:409});
 await admin.query("UPDATE digitization_gpu_slots SET lease_until=statement_timestamp()-interval '1 second' WHERE id=$1",[slot]);for(const stage of stages)await expect(transaction(actor,c=>acquireGpuLease(c,actor,fixture.engineId,stage.id,stage.execution_id,stage.fencing_token))).rejects.toMatchObject({status:409});
 expect((await pool.query('SELECT id FROM digitization_gpu_slots WHERE id=$1',[slot])).rowCount).toBe(0);
 const pending=await transaction(actor,async c=>{const row=(await c.query('SELECT version FROM processing_runs WHERE id=$1',[graphs[index].id])).rows[0];return requestRunCancellation(c,actor,fixture.engineId,graphs[index].id,row.version);});await transaction(actor,c=>c.query('SELECT digitization_close_cancellation($1,$2,$3)',[fixture.engineId,graphs[index].id,pending.version]));expect(await transaction(actor,c=>releaseGpuLease(c,actor,fixture.engineId,s.id,s.execution_id,s.fencing_token,slot,lease.fencing_token))).toEqual({released:true});const other=stages[1-index],reassigned=await transaction(actor,c=>acquireGpuLease(c,actor,fixture.engineId,other.id,other.execution_id,other.fencing_token));expect(BigInt(reassigned.fencing_token)).toBe(BigInt(lease.fencing_token)+1n);
},30000);
it('agency quotas reserve seconds/scratch across transactions and reject impossible per-run budgets',async()=>{
 await expect(transaction(actor,c=>requireRunBudget(c,actor,fixture.engineId,{maxSeconds:3601,maxScratchBytes:'67108864'}))).rejects.toMatchObject({status:422});await expect(transaction(actor,c=>requireRunBudget(c,actor,fixture.engineId,{maxSeconds:1,maxScratchBytes:'8589934593'}))).rejects.toMatchObject({status:422});
 await graph(3600,'8589934592');await expect(graph(3600,'8589934592')).rejects.toMatchObject({status:429});await graph(1,'1');await graph(1,'1');await expect(graph(1,'1')).rejects.toMatchObject({status:429});
});
