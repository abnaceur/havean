import '../support/env';
import {afterAll,expect,it} from 'vitest';
import type pg from 'pg';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {createListingDigitization} from '../../apps/api/src/inventory/digitization/intakes';
import {appendInputRevision} from '../../apps/api/src/inventory/digitization/inputs';
import {submitDigitizationUnitApplication} from '../../apps/api/src/inventory/digitization/inventory-application';
import {decideListingRevision} from '../../apps/api/src/inventory/revisions';
import {verifyUnitReviewSources} from '../../apps/api/src/inventory/digitization/inventory-source-preflight';
import type {DigitizationFactCandidate} from '@haven/contracts';
const admin:Actor={id:'00000000-0000-4000-8000-000000000010',orgId:null,roles:['admin']},agent:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']},reviewer:Actor={id:'00000000-0000-4000-8000-000000000008',orgId:null,roles:['moderator']},foreign:Actor={id:'00000000-0000-4000-8000-000000000011',orgId:'10000000-0000-4000-8000-000000000005',roles:['agency_manager']};
afterAll(()=>pool.end());
async function scope(c:pg.PoolClient,a:Actor){await c.query("SELECT set_config('app.actor',$1,true),set_config('app.org',$2,true),set_config('app.admin',$3,true),set_config('app.review',$4,true),set_config('app.agent_only',$5,true)",[a.id,a.orgId||'',String(a.roles.includes('admin')),String(a.roles.includes('moderator')),String(a.roles.includes('agent'))]);}
async function fixture(work:(c:pg.PoolClient,f:any)=>Promise<void>){const marker=new Error('rollback synthetic policy fixture');try{await transaction(admin,async c=>{
 const unit=(await c.query("INSERT INTO units(community_id,organization_id,area,beds,living_rooms,baths) SELECT community_id,organization_id,'88.50',2,1,1 FROM units WHERE id='10000000-0000-4000-8000-000000001000' RETURNING id")).rows[0].id;
 const listing=(await c.query(`INSERT INTO listings(unit_id,organization_id,owner_id,agent_id,slug,title,description,transaction,segment,currency,price,status) SELECT $1,organization_id,owner_id,agent_id,$2,'Reviewed unit policy fixture','Self-authored policy fixture only','sale','residential','CNY','2500000.25','published' FROM listings WHERE id='10000000-0000-4000-8000-000000002000' RETURNING id`,[unit,'unit-application-'+crypto.randomUUID()])).rows[0].id;
 await c.query("INSERT INTO listing_mandates(unit_id,organization_id,owner_id,expires_at) SELECT $1,$2,owner_id,now()+interval '30 days' FROM listings WHERE id=$3",[unit,foreign.orgId,listing]);
 const sibling=(await c.query(`INSERT INTO listings(unit_id,organization_id,owner_id,slug,title,description,transaction,segment,currency,price,status) SELECT $1,$2,owner_id,$3,'Other agency mandate fixture','Self-authored policy fixture only','sale','residential','CNY','2600000.75','published' FROM listings WHERE id=$4 RETURNING id`,[unit,foreign.orgId,'unit-sibling-'+crypto.randomUUID(),listing])).rows[0].id;
 await c.query("INSERT INTO memberships(user_id,organization_id,role,status) VALUES($1,$2,'agency_manager','active') ON CONFLICT(user_id,organization_id,role) DO NOTHING",[foreign.id,foreign.orgId]);
 await scope(c,agent);const engine=await createListingDigitization(c,agent,listing,1);
 // Synthetic database metadata only. No scan, decoder or benchmark claim.
 const asset=(await c.query("INSERT INTO media_assets(owner_id,object_key,mime,size,rights,visibility,purpose,status,scan_at) VALUES($1,$2,'image/png',100,'Self-authored policy metadata','private','document','approved',now()) RETURNING id",[agent.id,crypto.randomUUID()])).rows[0].id;
 await appendInputRevision(c,agent,engine.id,1,[{assetId:asset,assetVersion:1,inputRevision:1,purpose:'document',detectedMime:'image/png',bytes:100,sha256:'a'.repeat(64),decoderState:'requires_isolated_image_decoder'}]);
 const candidateId=crypto.randomUUID(),candidate:DigitizationFactCandidate={schemaVersion:1,id:candidateId,organizationId:agent.orgId!,target:{type:'listing',id:listing,unitId:unit},version:1,field:'unitArea',rawText:'Self-authored unit area 96.25',normalizedValue:{amount:'96.25',unit:'m2',basis:'document_unit_area'},origin:'document',extractionScore:null,scoreMethod:'synthetic-policy-test',evidence:[{assetId:asset,page:1,bbox:[0.1,0.1,0.9,0.2],coordinateSpace:'upright-page-normalized-top-left',quotedText:'Self-authored unit area 96.25'}],review:{status:'pending',actorId:null,reviewedAt:null},extractorVersion:'synthetic-policy-test',inputRevision:1};
 await c.query('INSERT INTO fact_candidates(id,digitization_id,organization_id,created_by,input_revision,field,candidate,extractor_version) VALUES($1,$2,$3,$4,1,$5,$6,$7)',[candidateId,engine.id,agent.orgId,agent.id,candidate.field,JSON.stringify(candidate),candidate.extractorVersion]);
 const decision=(await c.query("INSERT INTO fact_decisions(digitization_id,organization_id,created_by,candidate_id,candidate_version,decision) VALUES($1,$2,$3,$4,1,'accepted') RETURNING id",[engine.id,agent.orgId,agent.id,candidateId])).rows[0].id;
 const proposal=await submitDigitizationUnitApplication(c,agent,engine.id,{workspaceVersion:2,inputRevision:1,listingVersion:1,decisionIds:[decision],reason:'Explicitly confirmed synthetic unit area'});
 await work(c,{unit,listing,sibling,engine:engine.id,asset,candidateId,decision,proposal});throw marker;
 });}catch(error){if(error!==marker)throw error;}}
const approval={status:'approved' as const,version:1,reason:'Independent synthetic policy verification',verified:true};
it('confirmed unit proposals stay private and pending; independent approval changes the shared unit without copying evidence',async()=>fixture(async(c,f)=>{
 expect((await c.query('SELECT area::text FROM units WHERE id=$1',[f.unit])).rows[0].area).toBe('88.50');
 expect(JSON.stringify(f.proposal)).not.toContain(f.asset);expect(JSON.stringify(f.proposal)).not.toContain(f.decision);
 await scope(c,reviewer);await expect(decideListingRevision(c,reviewer,f.proposal.revisionId,{...approval,verified:false})).rejects.toMatchObject({status:400});
 await decideListingRevision(c,reviewer,f.proposal.revisionId,approval);
 expect((await c.query('SELECT area::text FROM units WHERE id=$1',[f.unit])).rows[0].area).toBe('96.25');
 expect((await c.query('SELECT version FROM inventory_unit_fact_versions WHERE unit_id=$1',[f.unit])).rows[0].version).toBe(2);
 expect((await c.query('SELECT id,version FROM listings WHERE unit_id=$1 ORDER BY id',[f.unit])).rows.every((r:any)=>r.version===2)).toBe(true);
 expect((await c.query('SELECT count(*)::int n FROM listing_price_history WHERE listing_id=ANY($1::uuid[])',[[f.listing,f.sibling]])).rows[0].n).toBe(0);
 await scope(c,foreign);expect((await c.query('SELECT * FROM digitization_inventory_applications WHERE revision_id=$1',[f.proposal.revisionId])).rowCount).toBe(0);expect((await c.query('SELECT * FROM fact_candidates WHERE id=$1',[f.candidateId])).rowCount).toBe(0);expect((await c.query('SELECT * FROM fact_decisions WHERE id=$1',[f.decision])).rowCount).toBe(0);
}));
it('unit version changes invalidate a pending proposal before public facts can be overwritten',async()=>fixture(async(c,f)=>{
 await scope(c,admin);await c.query("UPDATE units SET area='99.00' WHERE id=$1",[f.unit]);await scope(c,reviewer);
 await c.query('SAVEPOINT stale_unit');await expect(decideListingRevision(c,reviewer,f.proposal.revisionId,approval)).rejects.toMatchObject({code:'40001'});await c.query('ROLLBACK TO SAVEPOINT stale_unit');
 expect((await c.query('SELECT area::text FROM units WHERE id=$1',[f.unit])).rows[0].area).toBe('99.00');
}));
it('evidence version is checked again at independent approval',async()=>fixture(async(c,f)=>{
 await scope(c,agent);await c.query('UPDATE media_assets SET version=version+1 WHERE id=$1',[f.asset]);await scope(c,reviewer);
 await c.query('SAVEPOINT stale_source');await expect(decideListingRevision(c,reviewer,f.proposal.revisionId,approval)).rejects.toMatchObject({code:'40001'});await c.query('ROLLBACK TO SAVEPOINT stale_source');
 expect((await c.query('SELECT area::text FROM units WHERE id=$1',[f.unit])).rows[0].area).toBe('88.50');
}));
it('revoked author membership prevents the independent reviewer from applying facts',async()=>fixture(async(c,f)=>{
 await scope(c,admin);await c.query("UPDATE memberships SET status='inactive',version=version+1 WHERE user_id=$1 AND organization_id=$2 AND role='agent'",[agent.id,agent.orgId]);await scope(c,reviewer);
 await c.query('SAVEPOINT revoked_author');await expect(decideListingRevision(c,reviewer,f.proposal.revisionId,approval)).rejects.toMatchObject({code:'40001'});await c.query('ROLLBACK TO SAVEPOINT revoked_author');
 expect((await c.query('SELECT area::text FROM units WHERE id=$1',[f.unit])).rows[0].area).toBe('88.50');
}));
it('private source preflight context requires a persisted independent reviewer, not cached roles',async()=>fixture(async(c,f)=>{
 await scope(c,foreign);await c.query('SAVEPOINT private_context');await expect(c.query('SELECT digitization_inventory_review_sources($1)',[f.proposal.revisionId])).rejects.toMatchObject({code:'42501'});await c.query('ROLLBACK TO SAVEPOINT private_context');
 await scope(c,{...agent,roles:['admin']});await c.query('SAVEPOINT cached_role');await expect(c.query('SELECT digitization_inventory_review_sources($1)',[f.proposal.revisionId])).rejects.toMatchObject({code:'42501'});await c.query('ROLLBACK TO SAVEPOINT cached_role');
 await scope(c,reviewer);const context=(await c.query('SELECT digitization_inventory_review_sources($1) context',[f.proposal.revisionId])).rows[0].context;
 expect(context.author).toEqual(agent);expect(context.sources[0].assetId).toBe(f.asset);
 // Database context stays internal; no document bytes or grants are projected
 // into another agency or the canonical unit proposal receipt.
 expect(JSON.stringify(f.proposal)).not.toContain(f.asset);
}));
it('ordinary revision review preflight does not require engine evidence',async()=>{
 await expect(verifyUnitReviewSources(reviewer,crypto.randomUUID(),undefined)).resolves.toBeUndefined();
});
it('a later conflicting confirmation invalidates the selected fact decision',async()=>fixture(async(c,f)=>{
 await c.query("INSERT INTO fact_decisions(digitization_id,organization_id,created_by,candidate_id,candidate_version,decision) VALUES($1,$2,$3,$4,1,'conflict')",[f.engine,agent.orgId,agent.id,f.candidateId]);await scope(c,reviewer);
 await c.query('SAVEPOINT stale_confirmation');await expect(decideListingRevision(c,reviewer,f.proposal.revisionId,approval)).rejects.toMatchObject({code:'40001'});await c.query('ROLLBACK TO SAVEPOINT stale_confirmation');
 expect((await c.query('SELECT area::text FROM units WHERE id=$1',[f.unit])).rows[0].area).toBe('88.50');
}));
