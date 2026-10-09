import '../support/env';
import {afterAll,expect,it} from 'vitest';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {workerActor} from '../../apps/worker/src/processor';
import {checkedWorkspace,createIntake,createListingDigitization,grantOwnerEvidence,requireDigitizationAgency} from '../../apps/api/src/inventory/digitization/intakes';
import {idempotent} from '../../apps/api/src/platform/core';
import {digitizationIntakeCreate,digitizationWorkspaceRecord} from '../../packages/contracts/src/digitization-intake';
const agent:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']};
const owner:Actor={id:'00000000-0000-4000-8000-000000000002',orgId:null,roles:['owner']};
const foreign:Actor={id:'00000000-0000-4000-8000-000000000011',orgId:'10000000-0000-4000-8000-000000000005',roles:['agent']};
afterAll(()=>pool.end());
async function scope(c:any,a:Actor){await c.query("SELECT set_config('app.actor',$1,true),set_config('app.org',$2,true),set_config('app.admin',$3,true),set_config('app.review','false',true),set_config('app.agent_only',$4,true)",[a.id,a.orgId||'',a.roles.includes('admin')?'true':'false',a.roles.includes('agent')?'true':'false']);}
async function rollback(work:(c:any)=>Promise<void>){const marker=new Error('rollback');try{await transaction(workerActor,async c=>{await work(c);throw marker;});}catch(e){if(e!==marker)throw e;}}
it('HE-B01 private intake is authorized, durable and idempotent without fabricating a unit',async()=>rollback(async c=>{
 await scope(c,agent);const x=digitizationIntakeCreate.parse({authorityConfirmed:true}),req={method:'POST',url:'/api/v1/ops/digitization-intakes',headers:{'idempotency-key':crypto.randomUUID()}} as any;
 const created=await idempotent(c,agent,req,x,()=>createIntake(c,agent));expect(created).toMatchObject({organizationId:agent.orgId,createdBy:agent.id,target:{type:'intake'},unitId:null,listingId:null,inputRevision:0,capabilities:{ocrAvailable:false,reconstructionAvailable:false}});
 expect(await idempotent(c,agent,req,x,()=>{throw new Error('Duplicate execution');})).toEqual(created);
 await expect(idempotent(c,agent,req,{authorityConfirmed:false},()=>createIntake(c,agent))).rejects.toMatchObject({status:409});
 expect(await checkedWorkspace(c,created.id,'intake')).toEqual(created);
 await scope(c,foreign);await expect(checkedWorkspace(c,created.id,'intake')).rejects.toMatchObject({status:404});
 await scope(c,workerActor);await expect(requireDigitizationAgency(c,workerActor)).rejects.toMatchObject({status:403});
 await scope(c,owner);await expect(createIntake(c,owner)).rejects.toMatchObject({status:403});
 expect(digitizationIntakeCreate.safeParse({authorityConfirmed:true,organizationId:foreign.orgId}).success).toBe(false);
}));
it('HE-B01 persisted membership beats cached role labels and revocation denies resumed intake',async()=>rollback(async c=>{
 await scope(c,agent);const created=await createIntake(c,agent);
 await scope(c,workerActor);await c.query("UPDATE memberships SET status='inactive',version=version+1 WHERE user_id=$1 AND organization_id=$2 AND role='agent'",[agent.id,agent.orgId]);
 await scope(c,agent);await expect(requireDigitizationAgency(c,agent)).rejects.toMatchObject({status:403});await expect(checkedWorkspace(c,created.id)).rejects.toMatchObject({status:404});
}));
it('HE-B01 checked listing creation preserves current inventory/version and cannot grant evidence access',async()=>rollback(async c=>{
 const unit=(await c.query("INSERT INTO units(community_id,organization_id,area,beds,living_rooms,baths) SELECT community_id,organization_id,'88.50',2,1,1 FROM units WHERE id='10000000-0000-4000-8000-000000001000' RETURNING id")).rows[0].id;
 const listing=(await c.query("INSERT INTO listings(unit_id,organization_id,owner_id,agent_id,slug,title,description,transaction,segment,currency,price,status) SELECT $1,organization_id,$2,agent_id,$3,'Engine API scope','Synthetic listing author test','sale','residential','CNY','2500000.00','draft' FROM listings WHERE id='10000000-0000-4000-8000-000000002000' RETURNING id,version",[unit,owner.id,'he-b01-'+crypto.randomUUID()])).rows[0];
 await scope(c,agent);await expect(createListingDigitization(c,agent,listing.id,listing.version+1)).rejects.toMatchObject({status:409});
 const created=await createListingDigitization(c,agent,listing.id,listing.version);expect(created.target).toEqual({type:'listing',id:listing.id,unitId:unit});expect(digitizationWorkspaceRecord.parse(created)).toEqual(created);expect(await createListingDigitization(c,agent,listing.id,listing.version)).toEqual(created);
 expect((await c.query('SELECT status,version FROM listings WHERE id=$1',[listing.id])).rows[0]).toEqual({status:'draft',version:listing.version});
 await scope(c,foreign);await expect(createListingDigitization(c,foreign,listing.id,listing.version)).rejects.toMatchObject({status:404});
 await scope(c,workerActor);await c.query('UPDATE listings SET agent_id=NULL,version=version+1 WHERE id=$1',[listing.id]);await scope(c,agent);await expect(createListingDigitization(c,agent,listing.id,listing.version)).rejects.toMatchObject({status:404});
}));

it('HE-B01 two agency mandates retain separate deed grants and run access through the inventory port',async()=>rollback(async c=>{
 const second={...foreign,roles:['agency_manager']};
 await c.query("INSERT INTO memberships(user_id,organization_id,role,status) VALUES($1,$2,'agency_manager','active') ON CONFLICT(user_id,organization_id,role) DO NOTHING",[second.id,second.orgId]);
 const unit=(await c.query("INSERT INTO units(community_id,organization_id,area,beds,living_rooms,baths) SELECT community_id,organization_id,'88.50',2,1,1 FROM units WHERE id='10000000-0000-4000-8000-000000001000' RETURNING id")).rows[0].id;
 const first=(await c.query("INSERT INTO listings(unit_id,organization_id,owner_id,agent_id,slug,title,description,transaction,segment,currency,price,status) SELECT $1,organization_id,$2,agent_id,$3,'First engine mandate','Synthetic same-unit test','sale','residential','CNY','2500000.00','draft' FROM listings WHERE id='10000000-0000-4000-8000-000000002000' RETURNING id,version",[unit,owner.id,'he-b01-first-'+crypto.randomUUID()])).rows[0];
 await c.query("INSERT INTO owner_unit_grants(unit_id,owner_id,source,source_listing_id) VALUES($1,$2,'recorded_listing',$3)",[unit,owner.id,first.id]);
 await c.query("INSERT INTO listing_mandates(unit_id,organization_id,owner_id,expires_at) VALUES($1,$2,$3,now()+interval '30 days')",[unit,second.orgId,owner.id]);
 const other=(await c.query("INSERT INTO listings(unit_id,organization_id,owner_id,slug,title,description,transaction,segment,currency,price,status) VALUES($1,$2,$3,$4,'Second mandate','Explicitly separate agency','sale','residential','CNY','2500000.00','draft') RETURNING id,version",[unit,second.orgId,owner.id,'he-b01-second-'+crypto.randomUUID()])).rows[0];
 const asset=(await c.query("INSERT INTO media_assets(owner_id,object_key,mime,size,rights,visibility,purpose,status,scan_at) VALUES($1,$2,'application/pdf',100,'Synthetic owned deed','private','document','approved',now()) RETURNING id,version",[owner.id,crypto.randomUUID()])).rows[0];
 await scope(c,agent);const a=await createListingDigitization(c,agent,first.id,first.version);await c.query("INSERT INTO property_input_revisions(digitization_id,organization_id,created_by,revision,source_set) VALUES($1,$2,$3,1,'[]')",[a.id,agent.orgId,agent.id]);
 await scope(c,second);const b=await createListingDigitization(c,second,other.id,other.version);await c.query("INSERT INTO property_input_revisions(digitization_id,organization_id,created_by,revision,source_set) VALUES($1,$2,$3,1,'[]')",[b.id,second.orgId,second.id]);
 await scope(c,owner);const grant=await grantOwnerEvidence(c,owner,a.id,{digitizationVersion:1,assetId:asset.id,assetVersion:asset.version,inputRevision:1,granteeId:agent.id,purposes:['preview','document_processing'],expiresAt:new Date(Date.now()+86400000).toISOString()});expect(grant.granteeId).toBe(agent.id);
 await scope(c,agent);expect((await c.query("SELECT digitization_asset_access($1,$2,$3,1,'document_processing') AS allowed",[a.id,asset.id,asset.version])).rows[0].allowed).toBe(true);
 const run=(await c.query("INSERT INTO processing_runs(digitization_id,organization_id,created_by,input_revision,desired_outputs,budget,deadline) VALUES($1,$2,$3,1,ARRAY['facts'],'{}',now()+interval '1 hour') RETURNING id",[a.id,agent.orgId,agent.id])).rows[0];
 await scope(c,second);expect((await c.query("SELECT digitization_asset_access($1,$2,$3,1,'document_processing') AS allowed",[b.id,asset.id,asset.version])).rows[0].allowed).toBe(false);expect((await c.query('SELECT id FROM processing_runs WHERE id=$1',[run.id])).rowCount).toBe(0);await expect(checkedWorkspace(c,a.id)).rejects.toMatchObject({status:404});
}));
