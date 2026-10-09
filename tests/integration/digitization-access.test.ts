import '../support/env';
import {afterAll,expect,it} from 'vitest';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {workerActor} from '../../apps/worker/src/processor';
import {digitizationDocumentPreviewAccess,digitizationListingAccess,editableProperty} from '../../apps/api/src/inventory/property-access';
import {grantReviewEvidence} from '../../apps/api/src/inventory/moderation-evidence';
const owner:Actor={id:'00000000-0000-4000-8000-000000000002',orgId:null,roles:['owner']};
const agent:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']};
const reviewer:Actor={id:'00000000-0000-4000-8000-000000000008',orgId:null,roles:['moderator']};
const foreign:Actor={id:'00000000-0000-4000-8000-000000000011',orgId:'10000000-0000-4000-8000-000000000005',roles:['agency_manager']};
afterAll(()=>pool.end());

// All fault mutations and fixtures roll back. No isolated-stack fixture is left
// changed for following owner, media, outbox or browser regression lanes.
async function rolledBack(work:(c:any)=>Promise<void>){const rollback=new Error('fixture rollback');try{await transaction(workerActor,async c=>{await work(c);throw rollback;});}catch(error){if(error!==rollback)throw error;}}
async function scope(c:any,a:Actor){await c.query("SELECT set_config('app.actor',$1,true),set_config('app.org',$2,true),set_config('app.admin',$3,true),set_config('app.review',$4,true),set_config('app.agent_only',$5,true)",[a.id,a.orgId||'',a.roles.includes('admin')?'true':'false',a.roles.includes('moderator')?'true':'false',a.roles.includes('agent')?'true':'false']);}
async function listing(c:any){const unit=(await c.query("INSERT INTO units(community_id,organization_id,area,beds,living_rooms,baths) SELECT community_id,organization_id,'88.50',2,1,1 FROM units WHERE id='10000000-0000-4000-8000-000000001000' RETURNING id")).rows[0];const target=(await c.query("INSERT INTO listings(unit_id,organization_id,owner_id,agent_id,slug,title,description,transaction,segment,currency,price,status) SELECT $1,organization_id,$2,agent_id,$3,'HE-R02 private target','Synthetic scope regression','sale','residential','CNY','2400000.75','draft' FROM listings WHERE id='10000000-0000-4000-8000-000000002000' RETURNING *",[unit.id,owner.id,'he-r02-'+crypto.randomUUID()])).rows[0];const grant=(await c.query("INSERT INTO owner_unit_grants(unit_id,owner_id,source,source_listing_id) VALUES($1,$2,'recorded_listing',$3) RETURNING id",[unit.id,owner.id,target.id])).rows[0];return {target,grant};}
it('HE-R02 current owner grant, actual membership and assignment guard engine target access',async()=>rolledBack(async c=>{
 const {target,grant}=await listing(c);await scope(c,agent);expect((await digitizationListingAccess(c,agent,target.id)).id).toBe(target.id);expect((await editableProperty(c,agent,target.id,'listings')).id).toBe(target.id);
 await scope(c,foreign);await expect(digitizationListingAccess(c,foreign,target.id)).rejects.toMatchObject({status:404});
 await scope(c,workerActor);await expect(digitizationListingAccess(c,workerActor,target.id)).rejects.toMatchObject({status:404});
 await c.query('UPDATE listings SET agent_id=NULL,version=version+1 WHERE id=$1',[target.id]);await scope(c,agent);await expect(digitizationListingAccess(c,agent,target.id)).rejects.toMatchObject({status:404});
 await scope(c,owner);expect((await digitizationListingAccess(c,owner,target.id)).unit_id).toBe(target.unit_id);
 await scope(c,workerActor);await c.query("UPDATE owner_unit_grants SET expires_at=now()-interval '1 second',version=version+1 WHERE id=$1",[grant.id]);await scope(c,owner);await expect(digitizationListingAccess(c,owner,target.id)).rejects.toMatchObject({status:404});
}));
it('HE-R02 agency authority never opens an owner document; expired/completed reviewer grant denies previews',async()=>rolledBack(async c=>{
 const {target}=await listing(c);const asset=(await c.query("INSERT INTO media_assets(owner_id,object_key,mime,size,rights,visibility,purpose,status,scan_at) VALUES($1,$2,'application/pdf',100,'Synthetic source-access test','private','document','approved',now()) RETURNING id",[owner.id,crypto.randomUUID()])).rows[0];const submission=(await c.query("INSERT INTO owner_submissions(user_id,status,data) VALUES($1,'submitted',$2) RETURNING id",[owner.id,{documents:[asset.id]}])).rows[0];
 await scope(c,owner);expect((await digitizationDocumentPreviewAccess(c,owner,asset.id,target.id)).id).toBe(asset.id);
 await scope(c,agent);expect((await digitizationListingAccess(c,agent,target.id)).id).toBe(target.id);await expect(digitizationDocumentPreviewAccess(c,agent,asset.id,target.id)).rejects.toMatchObject({status:404});
 await scope(c,reviewer);await grantReviewEvidence(c,reviewer,submission.id);expect((await digitizationDocumentPreviewAccess(c,reviewer,asset.id)).id).toBe(asset.id);await c.query("UPDATE moderation_evidence_grants SET expires_at=now()-interval '1 second' WHERE submission_id=$1",[submission.id]);await expect(digitizationDocumentPreviewAccess(c,reviewer,asset.id)).rejects.toMatchObject({status:404});
 await scope(c,workerActor);await c.query("UPDATE moderation_evidence_grants SET expires_at=now()+interval '30 minutes' WHERE submission_id=$1",[submission.id]);await c.query("UPDATE owner_submissions SET status='rejected',version=version+1 WHERE id=$1",[submission.id]);await scope(c,reviewer);await expect(digitizationDocumentPreviewAccess(c,reviewer,asset.id)).rejects.toMatchObject({status:404});
}));
it('HE-R02 current database membership defeats cached agency role claims',async()=>rolledBack(async c=>{
 const {target}=await listing(c);await c.query("UPDATE memberships SET status='inactive',version=version+1 WHERE user_id=$1 AND organization_id=$2 AND role='agent'",[agent.id,agent.orgId]);await scope(c,agent);await expect(digitizationListingAccess(c,agent,target.id)).rejects.toMatchObject({status:404});
}));
