import '../support/env';
import {afterAll,expect,it} from 'vitest';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {createIntake} from '../../apps/api/src/inventory/digitization/intakes';
import {readProcessingMetrics} from '../../apps/api/src/inventory/digitization/processing-metrics';
const actor:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']};
afterAll(()=>pool.end());
async function rollback(work:(c:any)=>Promise<void>){const stop=new Error('rollback');try{await transaction(actor,async c=>{await work(c);throw stop;});}catch(e){if(e!==stop)throw e;}}
it('HE-K01 reports actual expired timestamps and retry caps without inventing duration samples',()=>rollback(async c=>{
 const w=await createIntake(c,actor);
 await c.query("INSERT INTO property_input_revisions(digitization_id,organization_id,created_by,revision,source_set) VALUES($1,$2,$3,1,'[]')",[w.id,actor.orgId,actor.id]);
 await c.query('UPDATE property_digitizations SET current_input_revision=1,version=version+1 WHERE id=$1',[w.id]);
 const run=(await c.query("INSERT INTO processing_runs(digitization_id,organization_id,created_by,input_revision,desired_outputs,budget,deadline) VALUES($1,$2,$3,1,ARRAY['facts'],'{}',statement_timestamp()+interval '2 seconds') RETURNING id",[w.id,actor.orgId,actor.id])).rows[0].id;
 const stages=[];for(let i=0;i<2;i++)stages.push((await c.query("INSERT INTO processing_stages(digitization_id,organization_id,created_by,run_id,stage_type,input_revision,input_fingerprint,profile_id) VALUES($1,$2,$3,$4,'document_ocr',1,$5,'generic-v1') RETURNING id",[w.id,actor.orgId,actor.id,run,'a'.repeat(64)])).rows[0].id);
 await c.query("UPDATE processing_runs SET state='queued',version=version+1 WHERE id=$1",[run]);
 const transition="UPDATE processing_stages SET state=$2,version=version+1 WHERE id=$1";
 const lease="UPDATE processing_stages SET state='leased',version=version+1,attempt=attempt+1,fencing_token=fencing_token+1,execution_id=$2,lease_until=statement_timestamp()+interval '1 minute' WHERE id=$1";
 for(let attempt=0;attempt<3;attempt++){
  await c.query(transition,[stages[1],'queued']);await c.query(lease,[stages[1],crypto.randomUUID()]);await c.query(transition,[stages[1],'failed_retryable']);
 }
 await c.query(transition,[stages[0],'queued']);await c.query(lease,[stages[0],crypto.randomUUID()]);
 expect((await readProcessingMetrics(c,actor,w.id)).alerts).toEqual([{code:'RETRY_LIMIT_REACHED',count:1}]);
 await c.query("UPDATE processing_stages SET lease_until=clock_timestamp()+interval '20 milliseconds',version=version+1 WHERE id=$1",[stages[0]]);
 await c.query('SELECT pg_sleep(2.1)');
 const metrics=await readProcessingMetrics(c,actor,w.id);
 expect(metrics.alerts).toEqual([{code:'EXECUTION_LEASE_ELAPSED',count:1},{code:'RETRY_LIMIT_REACHED',count:1},{code:'RUN_DEADLINE_ELAPSED',count:1}]);
 expect(metrics).toMatchObject({observedOutcomes:0,durationSamples:0,minimumSeconds:null,p50Seconds:null,maximumSeconds:null,physicalDeviceBenchmark:false,publiclyServed:false});
 for(const privateValue of [run,...stages,'a'.repeat(64)])expect(JSON.stringify(metrics)).not.toContain(privateValue);
 const other=await createIntake(c,actor);expect((await readProcessingMetrics(c,actor,other.id)).alerts).toEqual([]);
 await expect(readProcessingMetrics(c,{...actor,orgId:'10000000-0000-4000-8000-000000000005'},w.id)).rejects.toBeDefined();
 await c.query("INSERT INTO property_input_revisions(digitization_id,organization_id,created_by,revision,source_set) VALUES($1,$2,$3,2,'[]')",[w.id,actor.orgId,actor.id]);
 await c.query('UPDATE property_digitizations SET current_input_revision=2,version=version+1 WHERE id=$1',[w.id]);
 expect(await readProcessingMetrics(c,actor,w.id)).toMatchObject({inputRevision:2,alerts:[],runStates:[],observedOutcomes:0});
}));
