import '../support/env';
import {it,expect,afterAll} from 'vitest';
import type pg from 'pg';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {changeListingState} from '../../apps/api/src/inventory/workflow';
const organization='10000000-0000-4000-8000-000000000001';
const admin:Actor={id:'00000000-0000-4000-8000-000000000010',orgId:null,roles:['admin']};
const agent:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:organization,roles:['agent']};
const moderator:Actor={id:'00000000-0000-4000-8000-000000000008',orgId:null,roles:['moderator']};
const outsider:Actor={id:'00000000-0000-4000-8000-000000000011',orgId:'10000000-0000-4000-8000-000000000005',roles:['agent']};
afterAll(()=>pool.end());
async function scope(c:pg.PoolClient,a:Actor){await c.query("SELECT set_config('app.actor',$1,true),set_config('app.org',$2,true),set_config('app.admin',$3,true),set_config('app.review',$4,true),set_config('app.agent_only',$5,true)",[a.id,a.orgId||'',String(a.roles.includes('admin')),String(a.roles.includes('moderator')),String(a.roles.includes('agent'))]);}
async function fixture(c:pg.PoolClient){return(await c.query(`INSERT INTO listings(unit_id,organization_id,owner_id,agent_id,slug,title,description,transaction,segment,currency,price,photos,status,created_by)
 SELECT unit_id,organization_id,owner_id,agent_id,$1,title,description,transaction,segment,currency,price,photos,'draft',$2 FROM listings WHERE id='10000000-0000-4000-8000-000000002000' RETURNING id`,['workflow-'+crypto.randomUUID(),agent.id])).rows[0].id as string;}
async function rollback(work:(c:pg.PoolClient,id:string)=>Promise<void>){const marker=new Error('rollback verified fixture');try{await transaction(admin,async c=>{const id=await fixture(c);await work(c,id);throw marker;});}catch(error){if(error!==marker)throw error;}}
async function counts(c:pg.PoolClient,id:string){return(await c.query('SELECT (SELECT count(*)::int FROM listing_status_history WHERE listing_id=$1) history,(SELECT count(*)::int FROM audit_events WHERE resource_id=$1) audit,(SELECT count(*)::int FROM outbox WHERE aggregate_id=$1) outbox',[id])).rows[0];}
it('I03 valid draft, submission, review and publication append atomic status, audit and outbox records',async()=>{
 await rollback(async(c,id)=>{await scope(c,agent);expect(await changeListingState(c,agent,id,{status:'submitted',version:1})).toMatchObject({status:'submitted',version:2});await scope(c,moderator);await changeListingState(c,moderator,id,{status:'under_review',version:2});expect(await changeListingState(c,moderator,id,{status:'published',version:3,verified:true,reason:'Facts and authority verified'})).toMatchObject({status:'published',version:4});expect(await counts(c,id)).toEqual({history:3,audit:3,outbox:3});expect((await c.query('SELECT reviewed_by,published_at FROM listings WHERE id=$1',[id])).rows[0].reviewed_by).toBe(moderator.id);await scope(c,admin);expect((await c.query('SELECT * FROM published_listing_destination($1)',[id])).rowCount).toBe(1);});
});
it('I03 invalid transitions and stale versions do not change state or append events',async()=>{
 await rollback(async(c,id)=>{await scope(c,agent);await expect(changeListingState(c,agent,id,{status:'sold',version:1})).rejects.toMatchObject({code:'INVALID_TRANSITION'});await expect(changeListingState(c,agent,id,{status:'submitted',version:99})).rejects.toMatchObject({status:409});expect(await counts(c,id)).toEqual({history:0,audit:0,outbox:0});expect((await c.query('SELECT status,version FROM listings WHERE id=$1',[id])).rows[0]).toEqual({status:'draft',version:1});});
});
it('I03 incomplete facts and unverified decisions cannot publish',async()=>{
 await rollback(async(c,id)=>{await scope(c,agent);await changeListingState(c,agent,id,{status:'submitted',version:1});await scope(c,moderator);await changeListingState(c,moderator,id,{status:'under_review',version:2});await expect(changeListingState(c,moderator,id,{status:'published',version:3})).rejects.toMatchObject({status:400});await c.query('UPDATE listings SET photos=ARRAY[]::text[] WHERE id=$1',[id]);await expect(changeListingState(c,moderator,id,{status:'published',version:3,verified:true})).rejects.toMatchObject({status:400});expect(await counts(c,id)).toEqual({history:2,audit:2,outbox:2});expect((await c.query('SELECT status,version FROM listings WHERE id=$1',[id])).rows[0]).toEqual({status:'under_review',version:3});});
});
it('I03 unrelated agents, agent publication and moderator self approval are denied',async()=>{
 await rollback(async(c,id)=>{await scope(c,outsider);await expect(changeListingState(c,outsider,id,{status:'submitted',version:1})).rejects.toMatchObject({status:404});await scope(c,agent);await changeListingState(c,agent,id,{status:'submitted',version:1});await expect(changeListingState(c,agent,id,{status:'published',version:2,verified:true})).rejects.toMatchObject({status:403});await scope(c,moderator);await changeListingState(c,moderator,id,{status:'under_review',version:2});await c.query('UPDATE listings SET created_by=$2 WHERE id=$1',[id,moderator.id]);await expect(changeListingState(c,moderator,id,{status:'published',version:3,verified:true})).rejects.toMatchObject({status:403});expect(await counts(c,id)).toEqual({history:2,audit:2,outbox:2});});
});
it('I03 sold property is removed from the authoritative inquiry and booking destination',async()=>{
 await rollback(async(c,id)=>{await scope(c,agent);await changeListingState(c,agent,id,{status:'submitted',version:1});await scope(c,moderator);await changeListingState(c,moderator,id,{status:'under_review',version:2});await changeListingState(c,moderator,id,{status:'published',version:3,verified:true});await scope(c,agent);await changeListingState(c,agent,id,{status:'sold',version:4,reason:'Sale completed'});expect((await c.query('SELECT * FROM published_listing_destination($1)',[id])).rowCount).toBe(0);expect(await counts(c,id)).toEqual({history:4,audit:4,outbox:4});});
});
it('I03 downstream transaction failure rolls back state, history, audit and outbox together',async()=>{
 const id=await transaction(admin,fixture);const marker=new Error('downstream failure');await expect(transaction(agent,async c=>{await changeListingState(c,agent,id,{status:'submitted',version:1});throw marker;})).rejects.toBe(marker);await transaction(admin,async c=>{expect((await c.query('SELECT status,version FROM listings WHERE id=$1',[id])).rows[0]).toEqual({status:'draft',version:1});expect(await counts(c,id)).toEqual({history:0,audit:0,outbox:0});await c.query('DELETE FROM listings WHERE id=$1',[id]);});
});
