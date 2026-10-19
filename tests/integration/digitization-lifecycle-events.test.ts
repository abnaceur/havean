import '../support/env';
import {afterAll,expect,it} from 'vitest';
import {pool,transaction,event,type Actor} from '../../packages/database/src/index';
import {createIntake} from '../../apps/api/src/inventory/digitization/intakes';
import {consumeDigitizationEvent} from '../../apps/api/src/inventory/digitization/outbox';
const actor:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']};
afterAll(()=>pool.end());
it('current review/capture/privacy/publication notifications acknowledge once without running or publishing; unknown versions remain pending',async()=>{
 const workspace=await transaction(actor,c=>createIntake(c,actor));
 for(const kind of ['fact_decided','intake_draft_created','capture_session_created','capture_session_saved','frame_dataset_created','frame_privacy_created','scene_registration_saved','registration_review_requested','registration_reviewed','model_review_requested','model_reviewed','scene_privacy_declared','tour_saved','tour_review_requested','tour_reviewed','publication_proposed','package_published','package_revoked']){
  await transaction(actor,c=>event(c,actor,workspace.id,'digitization.'+kind,{}));
  const id=(await pool.query('SELECT id FROM outbox WHERE aggregate_id=$1 AND kind=$2',[workspace.id,'digitization.'+kind])).rows[0].id;
  const consume=()=>transaction(actor,c=>consumeDigitizationEvent(c,actor,id,workspace.id,null));
  expect(await consume()).toEqual({eventId:id,executions:[],cancellation:null});expect(await consume()).toEqual({eventId:id,executions:[],cancellation:null});
  await transaction(actor,async c=>{expect((await c.query("SELECT count(*)::int n FROM outbox_effects WHERE event_id=$1 AND consumer='digitization'",[id])).rows[0].n).toBe(1);});
  expect((await pool.query('SELECT processed_at FROM outbox WHERE id=$1',[id])).rows[0].processed_at).not.toBeNull();
 }
 await transaction(actor,c=>event(c,actor,workspace.id,'digitization.unknown_future_version',{}));const id=(await pool.query("SELECT id FROM outbox WHERE aggregate_id=$1 AND kind='digitization.unknown_future_version'",[workspace.id])).rows[0].id;
 await expect(transaction(actor,c=>consumeDigitizationEvent(c,actor,id,workspace.id,null))).rejects.toMatchObject({status:422,response:{code:'ENGINE_EVENT_UNSUPPORTED'}});expect((await pool.query('SELECT processed_at FROM outbox WHERE id=$1',[id])).rows[0].processed_at).toBeNull();
 await transaction(actor,async c=>{expect((await c.query('SELECT count(*)::int n FROM processing_runs WHERE digitization_id=$1',[workspace.id])).rows[0].n).toBe(0);expect((await c.query('SELECT count(*)::int n FROM published_packages WHERE digitization_id=$1',[workspace.id])).rows[0].n).toBe(0);});
});
