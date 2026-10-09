import '../support/env';
import {afterAll,expect,it} from 'vitest';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {createIntake} from '../../apps/api/src/inventory/digitization/intakes';
import {leaseStage,renewStageLease} from '../../apps/api/src/inventory/digitization/leases';
import {requestRunCancellation} from '../../apps/api/src/inventory/digitization/cancellation';
const actor:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']};
afterAll(()=>pool.end());
it('HE-C04 API-owned lease admits one current execution; wrong fencing, duplicate delivery and cancelled run cannot renew',async()=>{
 const stop=new Error('fixture rollback');try{await transaction(actor,async c=>{
  const engine=await createIntake(c,actor);
  await c.query("INSERT INTO property_input_revisions(digitization_id,organization_id,created_by,revision,source_set) VALUES($1,$2,$3,1,'[]')",[engine.id,actor.orgId,actor.id]);
  await c.query('UPDATE property_digitizations SET current_input_revision=1,version=version+1 WHERE id=$1',[engine.id]);
  const run=(await c.query("INSERT INTO processing_runs(digitization_id,organization_id,created_by,input_revision,desired_outputs,budget,deadline) VALUES($1,$2,$3,1,ARRAY['facts'],'{}',now()+interval '1 hour') RETURNING id",[engine.id,actor.orgId,actor.id])).rows[0].id;
  const stage=(await c.query("INSERT INTO processing_stages(digitization_id,organization_id,created_by,run_id,stage_type,input_revision,input_fingerprint,profile_id) VALUES($1,$2,$3,$4,'document_rasterize',1,$5,'pdfium-150dpi-v1') RETURNING id",[engine.id,actor.orgId,actor.id,run,'a'.repeat(64)])).rows[0].id;
  await c.query("UPDATE processing_runs SET state='queued',version=version+1 WHERE id=$1",[run]);
  await c.query("UPDATE processing_stages SET state='queued',version=version+1 WHERE id=$1",[stage]);
  await expect(leaseStage(c,{...actor,roles:['admin']},engine.id,stage,2)).rejects.toMatchObject({status:403});
  const receipt=await leaseStage(c,actor,engine.id,stage,2);expect(receipt).toMatchObject({attempt:1,fencing_token:'1',version:3});
  await expect(leaseStage(c,actor,engine.id,stage,2)).rejects.toMatchObject({status:409});
  expect((await c.query('SELECT count(*)::int n FROM stage_attempts WHERE stage_id=$1',[stage])).rows[0].n).toBe(1);
  await expect(renewStageLease(c,actor,engine.id,stage,crypto.randomUUID(),'1')).rejects.toMatchObject({status:409});
  await expect(renewStageLease(c,actor,engine.id,stage,receipt.execution_id,'2')).rejects.toMatchObject({status:409});
  expect(await renewStageLease(c,actor,engine.id,stage,receipt.execution_id,'1')).toMatchObject({execution_id:receipt.execution_id,fencing_token:'1',version:4});
  await c.query("UPDATE processing_stages SET lease_until=statement_timestamp()+interval '50 milliseconds',version=version+1 WHERE id=$1",[stage]);
  await c.query('SELECT pg_sleep(0.1)');
  await expect(renewStageLease(c,actor,engine.id,stage,receipt.execution_id,'1')).rejects.toMatchObject({status:409});
  await expect(requestRunCancellation(c,actor,engine.id,run,1)).rejects.toMatchObject({status:409});
  await expect(requestRunCancellation(c,{...actor,roles:['admin']},engine.id,run,3)).rejects.toMatchObject({status:403});
  const cancelled=await requestRunCancellation(c,actor,engine.id,run,3);
  expect(cancelled).toMatchObject({state:'cancel_requested',version:4});
  expect(await requestRunCancellation(c,actor,engine.id,run,4)).toEqual(cancelled);
  expect((await c.query("SELECT count(*)::int n FROM digitization_events WHERE run_id=$1 AND kind='digitization.cancel_requested'",[run])).rows[0].n).toBe(1);
  await expect(renewStageLease(c,actor,engine.id,stage,receipt.execution_id,'1')).rejects.toMatchObject({status:409});
  throw stop;
 });}catch(error){if(error!==stop)throw error;}
});
