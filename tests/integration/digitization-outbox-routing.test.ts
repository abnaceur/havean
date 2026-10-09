import '../support/env';
import {afterAll,expect,it} from 'vitest';
import {pool,transaction} from '../../packages/database/src/index';
import {createProcessor,workerActor} from '../../apps/worker/src/processor';
const created:string[]=[];
afterAll(async()=>{try{await transaction(workerActor,async c=>{await c.query('DELETE FROM outbox_effects WHERE event_id=ANY($1::uuid[])',[created]);await c.query('DELETE FROM outbox WHERE id=ANY($1::uuid[])',[created]);});}finally{await pool.end();}});
it('HE-R06 platform fail-closes engine delivery without acknowledging or applying any effect',async()=>{
 for(const kind of ['digitization.stage_ready','digitization.unknown_future_version']){
  const id=crypto.randomUUID();created.push(id);await transaction(workerActor,c=>c.query('INSERT INTO outbox(id,aggregate_id,kind,payload) VALUES($1,$2,$3,$4)',[id,crypto.randomUUID(),kind,{}]));
  await expect(createProcessor()({data:{id}})).rejects.toThrow('OUTBOX_CONSUMER_MISMATCH');
  expect((await pool.query('SELECT processed_at FROM outbox WHERE id=$1',[id])).rows[0].processed_at).toBeNull();
  expect((await transaction(workerActor,c=>c.query('SELECT 1 FROM outbox_effects WHERE event_id=$1',[id]))).rowCount).toBe(0);
  expect((await pool.query("SELECT id FROM outbox WHERE id=$1 AND processed_at IS NULL AND kind NOT LIKE 'digitization.%'",[id])).rowCount).toBe(0);
 }
});
it('HE-R06 duplicate ordinary platform delivery retains one effect and current acknowledgement',async()=>{
 const id=crypto.randomUUID();created.push(id);await transaction(workerActor,c=>c.query("INSERT INTO outbox(id,aggregate_id,kind,payload) VALUES($1,$2,'audit.test_routing','{}')",[id,crypto.randomUUID()]));
 await Promise.all([createProcessor()({data:{id}}),createProcessor()({data:{id}})]);
 expect((await transaction(workerActor,c=>c.query("SELECT consumer FROM outbox_effects WHERE event_id=$1",[id]))).rows).toEqual([{consumer:'platform'}]);
 expect((await pool.query('SELECT processed_at FROM outbox WHERE id=$1',[id])).rows[0].processed_at).not.toBeNull();
});
