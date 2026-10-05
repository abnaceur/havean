import '../support/env';
import {it,expect,afterAll} from 'vitest';
import type pg from 'pg';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {grantReviewEvidence,canReadPrivateEvidence} from '../../apps/api/src/inventory/moderation-evidence';
const admin:Actor={id:'00000000-0000-4000-8000-000000000010',orgId:null,roles:['admin']};
const reviewer:Actor={id:'00000000-0000-4000-8000-000000000008',orgId:null,roles:['moderator']};
const owner:Actor={id:'00000000-0000-4000-8000-000000000002',orgId:null,roles:['owner']};
const buyer:Actor={id:'00000000-0000-4000-8000-000000000001',orgId:null,roles:['consumer']};
afterAll(()=>pool.end());
async function rollback(work:(c:pg.PoolClient,submission:string,asset:string)=>Promise<void>){const marker=new Error('rollback fixture');try{await transaction(admin,async c=>{const asset=crypto.randomUUID();const submission=(await c.query("INSERT INTO owner_submissions(user_id,data,status) VALUES($1,$2,'submitted') RETURNING id",[owner.id,JSON.stringify({documents:[asset]})])).rows[0].id;await c.query("SELECT set_config('app.actor',$1,true),set_config('app.admin','false',true),set_config('app.review','true',true)",[reviewer.id]);await work(c,submission,asset);throw marker;});}catch(error){if(error!==marker)throw error;}}
it('I04 queue grants only submitted ownership evidence to the current reviewer',async()=>{
 await rollback(async(c,submission,asset)=>{expect(await canReadPrivateEvidence(c,reviewer,asset,owner.id)).toBe(false);await grantReviewEvidence(c,reviewer,submission);expect(await canReadPrivateEvidence(c,reviewer,asset,owner.id)).toBe(true);expect(await canReadPrivateEvidence(c,reviewer,crypto.randomUUID(),owner.id)).toBe(false);expect(await canReadPrivateEvidence(c,buyer,asset,owner.id)).toBe(false);expect(await canReadPrivateEvidence(c,owner,asset,owner.id)).toBe(true);});
});
it('I04 evidence grant expires and a completed decision immediately revokes access',async()=>{
 await rollback(async(c,submission,asset)=>{await grantReviewEvidence(c,reviewer,submission);await c.query("UPDATE moderation_evidence_grants SET expires_at=now()-interval '1 second' WHERE submission_id=$1",[submission]);expect(await canReadPrivateEvidence(c,reviewer,asset,owner.id)).toBe(false);await grantReviewEvidence(c,reviewer,submission);expect(await canReadPrivateEvidence(c,reviewer,asset,owner.id)).toBe(true);await c.query("UPDATE owner_submissions SET status='rejected' WHERE id=$1",[submission]);expect(await canReadPrivateEvidence(c,reviewer,asset,owner.id)).toBe(false);});
});
it('I04 repeated queue reads retain one grant and one audited grant event',async()=>{
 await rollback(async(c,submission)=>{await grantReviewEvidence(c,reviewer,submission);await grantReviewEvidence(c,reviewer,submission);expect((await c.query('SELECT count(*)::int n FROM moderation_evidence_grants WHERE submission_id=$1',[submission])).rows[0].n).toBe(1);expect((await c.query("SELECT count(*)::int n FROM audit_events WHERE resource_id=$1 AND action='review.evidence_granted'",[submission])).rows[0].n).toBe(1);});
});
it('I04 consumers cannot create review grants even through direct database access',async()=>{
 await rollback(async(c,submission)=>{await grantReviewEvidence(c,buyer,submission);expect((await c.query('SELECT count(*)::int n FROM moderation_evidence_grants WHERE submission_id=$1',[submission])).rows[0].n).toBe(0);await c.query("SELECT set_config('app.actor',$1,true),set_config('app.review','false',true)",[buyer.id]);await c.query('SAVEPOINT unauthorized');await expect(c.query("INSERT INTO moderation_evidence_grants(reviewer_id,submission_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[buyer.id,submission])).rejects.toMatchObject({code:'42501'});await c.query('ROLLBACK TO SAVEPOINT unauthorized');});
});
