import '../support/env';
import {afterAll,expect,it} from 'vitest';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {workerActor} from '../../apps/worker/src/processor';
const owner:Actor={id:'00000000-0000-4000-8000-000000000002',orgId:null,roles:['owner']};
const agent:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']};
const foreign:Actor={id:'00000000-0000-4000-8000-000000000011',orgId:'10000000-0000-4000-8000-000000000005',roles:['agency_manager']};
afterAll(()=>pool.end());
async function scope(c:any,a:Actor){await c.query("SELECT set_config('app.actor',$1,true),set_config('app.org',$2,true),set_config('app.admin',$3,true),set_config('app.review','false',true),set_config('app.agent_only',$4,true)",[a.id,a.orgId||'',a.roles.includes('admin')?'true':'false',a.roles.includes('agent')?'true':'false']);}
async function rollback(work:(c:any)=>Promise<void>){const marker=new Error('rollback');try{await transaction(workerActor,async c=>{await work(c);throw marker;});}catch(e){if(e!==marker)throw e;}}
async function denied(c:any,work:()=>Promise<any>,code='42501'){await c.query('SAVEPOINT denied');try{await expect(work()).rejects.toMatchObject({code});}finally{await c.query('ROLLBACK TO SAVEPOINT denied');await c.query('RELEASE SAVEPOINT denied');}}
async function fixture(c:any){
 await c.query("INSERT INTO memberships(user_id,organization_id,role,status) VALUES($1,$2,'agency_manager','active') ON CONFLICT(user_id,organization_id,role) DO NOTHING",[foreign.id,foreign.orgId]);
 const unit=(await c.query("INSERT INTO units(community_id,organization_id,area,beds,living_rooms,baths) SELECT community_id,organization_id,'88.50',2,1,1 FROM units WHERE id='10000000-0000-4000-8000-000000001000' RETURNING id")).rows[0].id;
 const a=(await c.query("INSERT INTO listings(unit_id,organization_id,owner_id,agent_id,slug,title,description,transaction,segment,currency,price,status) SELECT $1,organization_id,$2,agent_id,$3,'Engine scoped target','Synthetic SQL authority test','sale','residential','CNY','2400000.75','draft' FROM listings WHERE id='10000000-0000-4000-8000-000000002000' RETURNING id",[unit,owner.id,'he-schema-'+crypto.randomUUID()])).rows[0].id;
 const grant=(await c.query("INSERT INTO owner_unit_grants(unit_id,owner_id,source,source_listing_id) VALUES($1,$2,'recorded_listing',$3) RETURNING id",[unit,owner.id,a])).rows[0].id;
 await c.query("INSERT INTO listing_mandates(unit_id,organization_id,owner_id,expires_at) VALUES($1,$2,$3,now()+interval '30 days')",[unit,foreign.orgId,owner.id]);
 const b=(await c.query("INSERT INTO listings(unit_id,organization_id,owner_id,slug,title,description,transaction,segment,currency,price,status) VALUES($1,$2,$3,$4,'Other mandate','Same unit distinct agency','sale','residential','CNY','2500000.25','draft') RETURNING id",[unit,foreign.orgId,owner.id,'he-mandate-'+crypto.randomUUID()])).rows[0].id;
 const asset=(await c.query("INSERT INTO media_assets(owner_id,object_key,mime,size,rights,visibility,purpose,status,scan_at) VALUES($1,$2,'application/pdf',100,'Synthetic owned evidence','private','document','approved',now()) RETURNING id",[owner.id,crypto.randomUUID()])).rows[0].id;
 return {unit,a,b,asset,grant};
}
async function engine(c:any,a:Actor,target:string,unit:string){await scope(c,a);return (await c.query("INSERT INTO property_digitizations(organization_id,created_by,target_type,target_id,listing_id,unit_id) VALUES($1,$2,'listing',$3,$3,$4) RETURNING id",[a.orgId,a.id,target,unit])).rows[0].id;}
async function revision(c:any,a:Actor,id:string){await scope(c,a);return (await c.query("INSERT INTO property_input_revisions(digitization_id,organization_id,created_by,revision,source_set) VALUES($1,$2,$3,1,'[]') RETURNING id",[id,a.orgId,a.id])).rows[0].id;}
it('HE-A04 table ownership and real RLS exist; narrow worker identity gets no engine bypass',async()=>rollback(async c=>{
 const f=await fixture(c),id=await engine(c,agent,f.a,f.unit);
 await denied(c,()=>engine(c,agent,f.a,f.unit),'23505');
 const tables=(await c.query("SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename IN('property_digitizations','document_pages','fact_candidates','processing_runs','processing_stages','artifacts','approval_records','published_packages')")).rows;expect(tables).toHaveLength(8);expect(tables.every((r:any)=>r.rowsecurity)).toBe(true);
 await scope(c,workerActor);expect((await c.query('SELECT id FROM property_digitizations WHERE id=$1',[id])).rows).toEqual([]);
 await denied(c,()=>c.query("INSERT INTO property_digitizations(organization_id,created_by,target_type,target_id,listing_id,unit_id) VALUES($1,$2,'listing',$3,$3,$4)",[agent.orgId,workerActor.id,f.a,f.unit]));
}));
it('HE-A04 two mandates on one unit do not share engine records or private evidence',async()=>rollback(async c=>{
 const f=await fixture(c),a=await engine(c,agent,f.a,f.unit);await revision(c,agent,a);const b=await engine(c,foreign,f.b,f.unit);await revision(c,foreign,b);
 expect((await c.query('SELECT id FROM property_digitizations WHERE id=$1',[a])).rows).toEqual([]);
 await scope(c,agent);expect((await c.query('SELECT id FROM property_digitizations WHERE id=$1',[b])).rows).toEqual([]);
 await denied(c,()=>c.query("INSERT INTO digitization_asset_bindings(digitization_id,organization_id,created_by,input_revision,asset_id,asset_version,purpose,sensitivity) VALUES($1,$2,$3,1,$4,1,'document','private_evidence')",[a,agent.orgId,agent.id,f.asset]));
 await scope(c,owner);await c.query("INSERT INTO digitization_evidence_grants(digitization_id,organization_id,asset_id,asset_version,input_revision,owner_id,grantee_id,granted_by,purposes,expires_at) VALUES($1,$2,$3,1,1,$4,$5,$4,ARRAY['preview','document_processing'],now()+interval '1 day')",[a,agent.orgId,f.asset,owner.id,agent.id]);
 await scope(c,agent);await c.query("INSERT INTO digitization_asset_bindings(digitization_id,organization_id,created_by,input_revision,asset_id,asset_version,purpose,sensitivity) VALUES($1,$2,$3,1,$4,1,'document','private_evidence')",[a,agent.orgId,agent.id,f.asset]);
 expect((await c.query('SELECT asset_id FROM digitization_asset_bindings WHERE digitization_id=$1',[a])).rows).toHaveLength(1);
 await scope(c,foreign);await denied(c,()=>c.query("INSERT INTO digitization_asset_bindings(digitization_id,organization_id,created_by,input_revision,asset_id,asset_version,purpose,sensitivity) VALUES($1,$2,$3,1,$4,1,'document','private_evidence')",[b,foreign.orgId,foreign.id,f.asset]));
}));
it('HE-A04 expired explicit evidence grant removes private derived reads',async()=>rollback(async c=>{
 const f=await fixture(c),a=await engine(c,agent,f.a,f.unit);await revision(c,agent,a);await scope(c,owner);
 const grant=(await c.query("INSERT INTO digitization_evidence_grants(digitization_id,organization_id,asset_id,asset_version,input_revision,owner_id,grantee_id,granted_by,purposes,expires_at) VALUES($1,$2,$3,1,1,$4,$5,$4,ARRAY['preview','document_processing'],clock_timestamp()+interval '1 second') RETURNING id",[a,agent.orgId,f.asset,owner.id,agent.id])).rows[0].id;
 await scope(c,agent);await c.query("INSERT INTO digitization_asset_bindings(digitization_id,organization_id,created_by,input_revision,asset_id,asset_version,purpose,sensitivity) VALUES($1,$2,$3,1,$4,1,'document','private_evidence')",[a,agent.orgId,agent.id,f.asset]);
 await c.query("INSERT INTO fact_candidates(digitization_id,organization_id,created_by,input_revision,field,candidate,extractor_version) VALUES($1,$2,$3,1,'unitId','{}','generic-v1')",[a,agent.orgId,agent.id]);
 expect((await c.query('SELECT id FROM fact_candidates WHERE digitization_id=$1',[a])).rowCount).toBe(1);
 // statement_timestamp moves forward per statement even within a long transaction.
 await c.query('SELECT pg_sleep(1.1)');expect((await c.query('SELECT id FROM fact_candidates WHERE digitization_id=$1',[a])).rowCount).toBe(0);
 await scope(c,owner);expect((await c.query('SELECT state FROM digitization_evidence_grants WHERE id=$1',[grant])).rowCount).toBe(1);
}));
it('HE-A04 reassignment, revoked membership, mandate and owner grant remove authority',async()=>rollback(async c=>{
 const f=await fixture(c),a=await engine(c,agent,f.a,f.unit),b=await engine(c,foreign,f.b,f.unit);
 await scope(c,workerActor);await c.query("UPDATE listing_mandates SET status='revoked',version=version+1 WHERE unit_id=$1 AND organization_id=$2",[f.unit,foreign.orgId]);await scope(c,foreign);expect((await c.query('SELECT id FROM property_digitizations WHERE id=$1',[b])).rowCount).toBe(0);
 await scope(c,workerActor);await c.query('UPDATE listings SET agent_id=NULL,version=version+1 WHERE id=$1',[f.a]);await scope(c,agent);expect((await c.query('SELECT id FROM property_digitizations WHERE id=$1',[a])).rowCount).toBe(0);
 await scope(c,owner);expect((await c.query('SELECT id FROM property_digitizations WHERE id=$1',[a])).rowCount).toBe(1);
 await scope(c,workerActor);await c.query("UPDATE owner_unit_grants SET status='revoked',version=version+1 WHERE id=$1",[f.grant]);await scope(c,owner);expect((await c.query('SELECT id FROM property_digitizations WHERE id=$1',[a])).rowCount).toBe(0);
}));
it('HE-A04 cross-org children, cross-run stages and stale/immutable edits are rejected',async()=>rollback(async c=>{
 const f=await fixture(c),a=await engine(c,agent,f.a,f.unit);const rev=await revision(c,agent,a);
 await denied(c,()=>c.query("INSERT INTO property_input_revisions(digitization_id,organization_id,created_by,revision,source_set) VALUES($1,$2,$3,2,'[]')",[a,foreign.orgId,agent.id]),'23514');
 expect((await c.query("UPDATE property_input_revisions SET configuration='{}',version=version+1 WHERE id=$1",[rev])).rowCount).toBe(0);
 await denied(c,()=>c.query('UPDATE property_digitizations SET current_input_revision=1 WHERE id=$1',[a]),'23514');
 await denied(c,()=>c.query("INSERT INTO approval_records(digitization_id,organization_id,created_by,input_revision,scope,snapshot,decision,reason) VALUES($1,$2,$3,1,'package','{}','approved','Attempt own publication')",[a,agent.orgId,agent.id]));
 const runIds=[];for(let i=0;i<2;i++)runIds.push((await c.query("INSERT INTO processing_runs(digitization_id,organization_id,created_by,input_revision,desired_outputs,budget,deadline) VALUES($1,$2,$3,1,ARRAY['facts'],'{}',now()+interval '1 hour') RETURNING id",[a,agent.orgId,agent.id])).rows[0].id);
 await denied(c,()=>c.query("UPDATE processing_runs SET desired_outputs=ARRAY['splat'],version=version+1 WHERE id=$1",[runIds[0]]),'23514');
 const stages=[];for(const id of runIds)stages.push((await c.query("INSERT INTO processing_stages(digitization_id,organization_id,created_by,run_id,stage_type,input_revision,input_fingerprint,profile_id) VALUES($1,$2,$3,$4,'document_ocr',1,$5,'generic-v1') RETURNING id",[a,agent.orgId,agent.id,id,'a'.repeat(64)])).rows[0].id);
 await denied(c,()=>c.query('INSERT INTO processing_stage_dependencies(digitization_id,organization_id,created_by,stage_id,dependency_id) VALUES($1,$2,$3,$4,$5)',[a,agent.orgId,agent.id,...stages]),'23514');
}));
it('HE-A04 private intake needs no fake unit/geography and duplicate active target is denied',async()=>rollback(async c=>{
 await scope(c,agent);const id=crypto.randomUUID();await c.query("INSERT INTO property_digitizations(id,organization_id,created_by,target_type,target_id) VALUES($1,$2,$3,'intake',$1)",[id,agent.orgId,agent.id]);expect((await c.query('SELECT unit_id,listing_id FROM property_digitizations WHERE id=$1',[id])).rows[0]).toEqual({unit_id:null,listing_id:null});
 await scope(c,foreign);expect((await c.query('SELECT id FROM property_digitizations WHERE id=$1',[id])).rowCount).toBe(0);
}));
