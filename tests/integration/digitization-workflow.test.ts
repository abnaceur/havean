import '../support/env';
import {afterAll,expect,it} from 'vitest';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {createRunGraph,dispatchRunGraph} from '../../apps/api/src/inventory/digitization/workflow';
import {createIntake} from '../../apps/api/src/inventory/digitization/intakes';
const actor:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']};
afterAll(()=>pool.end());
async function rollback(work:(c:any)=>Promise<void>){const stop=new Error('rollback');try{await transaction(actor,async c=>{await work(c);throw stop;});}catch(e){if(e!==stop)throw e;}}
async function denied(c:any,sql:string,values:any[]){await c.query('SAVEPOINT invalid');try{await expect(c.query(sql,values)).rejects.toMatchObject({code:'23514'});}finally{await c.query('ROLLBACK TO SAVEPOINT invalid');await c.query('RELEASE SAVEPOINT invalid');}}
async function fixture(c:any){
 const w=await createIntake(c,actor);
 await c.query("INSERT INTO property_input_revisions(digitization_id,organization_id,created_by,revision,source_set) VALUES($1,$2,$3,1,'[]')",[w.id,actor.orgId,actor.id]);
 const run=(await c.query("INSERT INTO processing_runs(digitization_id,organization_id,created_by,input_revision,desired_outputs,budget,deadline) VALUES($1,$2,$3,1,ARRAY['facts'],'{}',now()+interval '1 hour') RETURNING id",[w.id,actor.orgId,actor.id])).rows[0].id;
 const stages=[];for(const type of ['document_ocr','fact_extract'])stages.push((await c.query("INSERT INTO processing_stages(digitization_id,organization_id,created_by,run_id,stage_type,input_revision,input_fingerprint,profile_id) VALUES($1,$2,$3,$4,$5,1,$6,'generic-v1') RETURNING id",[w.id,actor.orgId,actor.id,run,type,'a'.repeat(64)])).rows[0].id);
 const edge=[w.id,actor.orgId,actor.id,stages[1],stages[0]];
 const edgeSql='INSERT INTO processing_stage_dependencies(digitization_id,organization_id,created_by,stage_id,dependency_id) VALUES($1,$2,$3,$4,$5)';
 await c.query(edgeSql,edge);return {run,stages,edge,edgeSql};
}
const transition="UPDATE processing_stages SET state=$2,version=version+1 WHERE id=$1";
const lease="UPDATE processing_stages SET state='leased',version=version+1,attempt=attempt+1,fencing_token=fencing_token+1,execution_id=$2,lease_until=statement_timestamp()+interval '1 minute' WHERE id=$1";
it('HE-C01 real database rejects cycles, sealed graph edits, invalid transitions and unsatisfied dependencies',()=>rollback(async c=>{
 const f=await fixture(c);
 await denied(c,f.edgeSql,[...f.edge.slice(0,3),f.stages[0],f.stages[1]]);
 await denied(c,"UPDATE processing_runs SET state='ready',version=version+1 WHERE id=$1",[f.run]);
 await denied(c,transition,[f.stages[0],'succeeded']);
 await c.query("UPDATE processing_runs SET state='queued',version=version+1 WHERE id=$1",[f.run]);
 await denied(c,f.edgeSql,[...f.edge.slice(0,3),f.stages[0],f.stages[1]]);
 await denied(c,transition,[f.stages[1],'queued']);
 await c.query(transition,[f.stages[0],'queued']);
 await denied(c,transition,[f.stages[0],'leased']);
 await denied(c,lease.replace("interval '1 minute'","interval '1 day'"),[f.stages[0],crypto.randomUUID()]);
 await c.query(lease,[f.stages[0],crypto.randomUUID()]);
 await c.query(transition,[f.stages[0],'running']);
 await c.query(transition,[f.stages[0],'succeeded']);
 await c.query(transition,[f.stages[1],'queued']);
 await denied(c,transition,[f.stages[0],'queued']);
 expect((await c.query('SELECT state FROM processing_stages WHERE id=$1',[f.stages[1]])).rows[0].state).toBe('queued');
}));
it('HE-C01 cancellation fences active results and preserves terminal successful branches',()=>rollback(async c=>{
 const f=await fixture(c);await c.query("UPDATE processing_runs SET state='queued',version=version+1 WHERE id=$1",[f.run]);
 await c.query(transition,[f.stages[0],'queued']);await c.query(lease,[f.stages[0],crypto.randomUUID()]);await c.query(transition,[f.stages[0],'running']);
 await c.query("UPDATE processing_runs SET state='cancel_requested',cancel_requested_at=statement_timestamp(),version=version+1 WHERE id=$1",[f.run]);
 await denied(c,transition,[f.stages[0],'succeeded']);
 await denied(c,"UPDATE processing_runs SET state='cancelled',version=version+1 WHERE id=$1",[f.run]);
 for(const stage of f.stages)await c.query(transition,[stage,'cancelled']);
 await c.query("UPDATE processing_runs SET state='cancelled',version=version+1 WHERE id=$1",[f.run]);
 await denied(c,"UPDATE processing_runs SET state='queued',cancel_requested_at=NULL,version=version+1 WHERE id=$1",[f.run]);
}));
it('HE-C01 expired execution cannot commit success; recovery obtains a new execution and fence',()=>rollback(async c=>{
 const f=await fixture(c);await c.query("UPDATE processing_runs SET state='queued',version=version+1 WHERE id=$1",[f.run]);
 await c.query(transition,[f.stages[0],'queued']);
 const execution=crypto.randomUUID();await c.query(lease,[f.stages[0],execution]);
 // A real short lease expires between statements without changing SQL transaction scope.
 await c.query("UPDATE processing_stages SET lease_until=clock_timestamp()+interval '20 milliseconds',version=version+1 WHERE id=$1",[f.stages[0]]);
 await c.query('SELECT pg_sleep(0.03)');
 await denied(c,transition,[f.stages[0],'running']);
 await c.query(transition,[f.stages[0],'failed_retryable']);await c.query(transition,[f.stages[0],'queued']);
 await denied(c,lease,[f.stages[0],execution]);await c.query(lease,[f.stages[0],crypto.randomUUID()]);
 expect((await c.query('SELECT attempt,fencing_token FROM processing_stages WHERE id=$1',[f.stages[0]])).rows[0]).toEqual({attempt:2,fencing_token:'2'});
}));

it('HE-C01 API-owned graph snapshot checks actor, target and current source/version before persistence',()=>rollback(async c=>{
 const w=await createIntake(c,actor);
 await c.query("INSERT INTO property_input_revisions(digitization_id,organization_id,created_by,revision,source_set) VALUES($1,$2,$3,1,'[]')",[w.id,actor.orgId,actor.id]);
 await c.query('UPDATE property_digitizations SET current_input_revision=1,version=version+1 WHERE id=$1',[w.id]);
 const stage={id:crypto.randomUUID(),type:'document_ocr' as const,state:'pending' as const,dependencies:[],profileId:'generic-v1',inputFingerprint:'a'.repeat(64),inputRevision:1,attempt:0,fencingToken:null,executionId:null,progress:null};
 const graph={schemaVersion:1 as const,id:crypto.randomUUID(),organizationId:actor.orgId!,creatorId:actor.id,target:{type:'intake' as const,id:w.id},inputRevision:1,state:'draft' as const,version:1,stages:[stage],deadline:new Date(Date.now()+3600000).toISOString(),budget:{maxSeconds:300,maxScratchBytes:'1000000'}};
 await expect(createRunGraph(c,actor,w.id,1,graph,['facts'])).rejects.toMatchObject({status:409});
 await expect(createRunGraph(c,actor,w.id,2,{...graph,creatorId:crypto.randomUUID()},['facts'])).rejects.toMatchObject({status:403});
 await expect(createRunGraph(c,actor,w.id,2,{...graph,inputRevision:2,stages:[{...stage,inputRevision:2}]},['facts'])).rejects.toMatchObject({status:409});
 expect(await createRunGraph(c,actor,w.id,2,graph,['facts'])).toEqual(graph);
 expect((await c.query('SELECT state,input_revision FROM processing_runs WHERE id=$1',[graph.id])).rows[0]).toEqual({state:'draft',input_revision:1});
 expect((await c.query('SELECT kind,state FROM digitization_events WHERE run_id=$1',[graph.id])).rows[0]).toEqual({kind:'digitization.run_created',state:'draft'});
}));

it('HE-C01 skipping a required upstream stage does not authorize its dependent execution',()=>rollback(async c=>{
 const f=await fixture(c);
 await c.query("UPDATE processing_runs SET state='queued',version=version+1 WHERE id=$1",[f.run]);
 await c.query(transition,[f.stages[0],'skipped']);
 await denied(c,transition,[f.stages[1],'queued']);
}));

async function dispatchFixture(c:any){
 const w=await createIntake(c,actor);
 const asset=(await c.query("INSERT INTO media_assets(owner_id,object_key,mime,size,rights,visibility,purpose,status,scan_at) VALUES($1,$2,'application/pdf',100,'Synthetic dispatch authority fixture','private','document','approved',now()) RETURNING id,version",[actor.id,crypto.randomUUID()])).rows[0];
 const sources=[{assetId:asset.id,assetVersion:asset.version,purpose:'document',sha256:'a'.repeat(64),bytes:'100',detectedMime:'application/pdf',decoderState:'requires_isolated_pdf_decoder'}];
 await c.query('INSERT INTO property_input_revisions(digitization_id,organization_id,created_by,revision,source_set) VALUES($1,$2,$3,1,$4)',[w.id,actor.orgId,actor.id,JSON.stringify(sources)]);
 await c.query('UPDATE property_digitizations SET current_input_revision=1,version=version+1 WHERE id=$1',[w.id]);
 const first=crypto.randomUUID(),second=crypto.randomUUID();
 const stage={type:'document_rasterize' as const,state:'pending' as const,profileId:'pdfium-150dpi-v1',inputFingerprint:'a'.repeat(64),inputRevision:1,attempt:0,fencingToken:null,executionId:null,progress:null};
 const graph={schemaVersion:1 as const,id:crypto.randomUUID(),organizationId:actor.orgId!,creatorId:actor.id,target:{type:'intake' as const,id:w.id},inputRevision:1,state:'draft' as const,version:1,stages:[{...stage,id:first,dependencies:[]},{...stage,id:second,dependencies:[first]}],deadline:new Date(Date.now()+3600000).toISOString(),budget:{maxSeconds:300,maxScratchBytes:'67108864'}};
 await createRunGraph(c,actor,w.id,2,graph,['facts']);
 return {engine:w.id,run:graph.id,first,second,asset:asset.id};
}

it('HE-C01 dispatch atomically queues only roots and emits one redacted durable event; duplicate and stale dispatch are denied',()=>rollback(async c=>{
 const f=await dispatchFixture(c);
 await expect(dispatchRunGraph(c,actor,f.engine,f.run,2)).rejects.toMatchObject({status:409});
 const result=await dispatchRunGraph(c,actor,f.engine,f.run,1);
 expect(result).toEqual({id:f.run,state:'queued',version:2,stageIds:[f.first]});
 expect((await c.query('SELECT id,state FROM processing_stages WHERE run_id=$1 ORDER BY id',[f.run])).rows).toEqual([{id:f.first,state:'queued'},{id:f.second,state:'pending'}].sort((a,b)=>a.id.localeCompare(b.id)));
 await expect(dispatchRunGraph(c,actor,f.engine,f.run,1)).rejects.toMatchObject({status:409});
 await expect(dispatchRunGraph(c,actor,f.engine,f.run,2)).rejects.toMatchObject({status:409});
 const events=(await c.query("SELECT payload FROM outbox WHERE aggregate_id=$1 AND kind='digitization.run_queued'",[f.engine])).rows;
 expect(events).toHaveLength(1);expect(events[0].payload).toMatchObject({runId:f.run,inputRevision:1});
 expect(JSON.stringify(events)).not.toContain(f.asset);
 expect((await c.query("SELECT count(*)::int n FROM digitization_events WHERE run_id=$1 AND kind='digitization.run_queued'",[f.run])).rows[0].n).toBe(1);
}));

it('HE-C01 dispatch rejects changed source authority, initiating actor and source revision without queuing a run',()=>rollback(async c=>{
 const f=await dispatchFixture(c);
 await expect(dispatchRunGraph(c,{...actor,id:'00000000-0000-4000-8000-000000000002'},f.engine,f.run,1)).rejects.toHaveProperty('status');
 await c.query('SAVEPOINT source_authority');
 await c.query("UPDATE media_assets SET status='rejected',version=version+1 WHERE id=$1",[f.asset]);
 // Exact-revision RLS now hides the run itself when its source is revoked.
 await expect(dispatchRunGraph(c,actor,f.engine,f.run,1)).rejects.toMatchObject({status:404});
 await c.query('ROLLBACK TO SAVEPOINT source_authority');
 await c.query("INSERT INTO property_input_revisions(digitization_id,organization_id,created_by,revision,source_set) VALUES($1,$2,$3,2,'[]')",[f.engine,actor.orgId,actor.id]);
 await c.query('UPDATE property_digitizations SET current_input_revision=2,version=version+1 WHERE id=$1',[f.engine]);
 await expect(dispatchRunGraph(c,actor,f.engine,f.run,1)).rejects.toMatchObject({status:409});
 expect((await c.query('SELECT state FROM processing_runs WHERE id=$1',[f.run])).rows[0].state).toBe('draft');
 expect((await c.query("SELECT count(*)::int n FROM outbox WHERE aggregate_id=$1 AND kind='digitization.run_queued'",[f.engine])).rows[0].n).toBe(0);
}));
