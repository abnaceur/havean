import {fixtureAccountState} from '../support/account-fixture';
import '../support/env';
import {beforeAll,afterAll,it,expect} from 'vitest';
import type {FastifyRequest} from 'fastify';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {workerActor} from '../../apps/worker/src/processor';
import {EngagementController} from '../../apps/api/src/engagement/controller';
import {ConversationsController} from '../../apps/api/src/engagement/conversations';
import {LeadAssignmentsController} from '../../apps/api/src/engagement/lead-assignments';
import type {Identity} from '../../apps/api/src/platform/core';
const org='10000000-0000-4000-8000-000000000001',foreign='10000000-0000-4000-8000-000000000005',buyer:Actor={id:crypto.randomUUID(),orgId:null,roles:['consumer']},other:Actor={id:'00000000-0000-4000-8000-000000000002',orgId:null,roles:['owner']},manager:Actor={id:'00000000-0000-4000-8000-000000000010',orgId:org,roles:['admin','agency_manager']},people:(Actor&{agent:string})[]=[],leads:string[]=[],threads:string[]=[];
const identity=(a:Actor)=>({actor:async()=>a} as unknown as Identity),engagement=(a:Actor)=>new EngagementController(identity(a)),conversations=(a:Actor)=>new ConversationsController(identity(a)),req=(url='/api/v1/inquiries')=>({method:'POST',url,headers:{'idempotency-key':crypto.randomUUID()}} as unknown as FastifyRequest);
beforeAll(async()=>{await transaction(workerActor,async c=>{await c.query("INSERT INTO profiles(id,subject,email,display_name,email_verified) VALUES($1,$2,$3,'M03 customer',true)",[buyer.id,'m03-'+buyer.id,'m03-'+buyer.id+'@example.test']);for(const agency of [org,org,foreign]){const id=crypto.randomUUID(),agent=crypto.randomUUID();await c.query("INSERT INTO profiles(id,subject,email,display_name,email_verified) VALUES($1,$2,$3,'M03 professional',true)",[id,'m03-'+id,'m03-'+id+'@example.test']);await c.query("INSERT INTO memberships(user_id,organization_id,role) VALUES($1,$2,'agent')",[id,agency]);await c.query("INSERT INTO agents(id,user_id,organization_id,name,slug,biography,languages,districts,city,verified_until) VALUES($1,$2,$3,'M03 synthetic agent',$4,'Synthetic membership acceptance fixture',ARRAY['English'],ARRAY['Chaoyang'],'bj','2035-01-01')",[agent,id,agency,'m03-'+agent]);people.push({id,agent,orgId:agency,roles:['agent']});}});});
afterAll(async()=>{try{await transaction(workerActor,async c=>{await c.query("UPDATE leads SET status='lost',version=version+1 WHERE id=ANY($1::uuid[])",[leads]);await c.query("UPDATE conversations SET state='closed',version=version+1 WHERE id=ANY($1::uuid[])",[threads]);await c.query("UPDATE memberships SET status='inactive',version=version+1 WHERE user_id=ANY($1::uuid[])",[people.map(p=>p.id)]);await fixtureAccountState(c,'suspended',"WHERE id=ANY($1::uuid[])",[[buyer.id,...people.map(p=>p.id)]]);});}finally{await pool.end();}});
async function inquiry(){const r=(await engagement(buyer).inquiry(req(),{resourceId:people[0].agent,resourceType:'agent',resourceVersion:1,city:'bj',name:'M03 customer',email:'conversation-'+buyer.id+'@example.test',phone:'123456789',message:'A real linked inquiry for this agent',consent:true})).data;leads.push(r.id);threads.push(r.conversationId!);return r;}

async function send(id:string,a:Actor,body:string){return (await engagement(a).message(req(),id,{version:0,conversationVersion:(await conversations(a).detail(req(),id)).data.version,clientId:crypto.randomUUID(),body})).data;}
async function unread(id:string,a:Actor){return (await engagement(a).conversations(req())).data.find(r=>r.id===id)?.unread_count;}
it('M03 unread counts exclude own messages and only a participant’s monotonic committed cursor marks incoming messages read',async()=>{
 const id=(await inquiry()).conversationId!;await send(id,people[0],'First incoming message');await send(id,buyer,'Own reply');await send(id,people[0],'Second incoming message');
 expect(await unread(id,buyer)).toBe('2');expect(await unread(id,people[0])).toBe('1');expect((await conversations(buyer).cursor(req(),id)).data).toEqual({version:0,sequence:'0'});
 const saved=(await conversations(buyer).read(req(),id,{version:0,sequence:'1'})).data;expect(saved).toEqual({version:1,sequence:'1'});expect(await unread(id,buyer)).toBe('1');expect(await unread(id,people[0])).toBe('1');
 expect((await conversations(buyer).read(req(),id,{version:0,sequence:'1'})).data).toEqual(saved);
 await expect(conversations(buyer).read(req(),id,{version:0,sequence:'3'})).rejects.toMatchObject({status:409});await expect(conversations(buyer).read(req(),id,{version:1,sequence:'0'})).rejects.toMatchObject({status:409});await expect(conversations(buyer).read(req(),id,{version:1,sequence:'4'})).rejects.toMatchObject({status:422});
 await conversations(buyer).read(req(),id,{version:1,sequence:'3'});expect(await unread(id,buyer)).toBe('0');
 await expect(transaction(buyer,c=>c.query('UPDATE conversation_read_cursors SET sequence=0,version=version+1 WHERE conversation_id=$1',[id]))).rejects.toMatchObject({code:'23514'});
});
it('M03 current scope protects cursor reads/updates and reassignment revokes old professional read state',async()=>{
 const lead=await inquiry(),id=lead.conversationId!;await send(id,buyer,'A private message');for(const a of [people[1],people[2],other]){await expect(conversations(a).cursor(req(),id)).rejects.toMatchObject({status:404});await expect(conversations(a).read(req(),id,{version:0,sequence:'1'})).rejects.toMatchObject({status:404});}
 await conversations(people[0]).read(req(),id,{version:0,sequence:'1'});await new LeadAssignmentsController(identity(manager)).assign(req('/api/v1/ops/leads/'+lead.id+'/assignment'),lead.id,{version:1,agentId:people[1].agent,reason:'Transfer this private conversation'});
 await expect(conversations(people[0]).cursor(req(),id)).rejects.toMatchObject({status:404});await expect(conversations(people[0]).read(req(),id,{version:1,sequence:'1'})).rejects.toMatchObject({status:404});expect(await unread(id,people[1])).toBe('1');
});
it('M03 latest history and before/after pages remain ordered and recover all messages beyond the initial window',async()=>{
 const id=(await inquiry()).conversationId!;await transaction(workerActor,async c=>{for(let sequence=1;sequence<=205;sequence++)await c.query('INSERT INTO messages(conversation_id,sender_id,client_id,sequence,body) VALUES($1,$2,$3,$4,$5)',[id,people[0].id,crypto.randomUUID(),String(sequence),'Historical paging fixture '+sequence]);});
 const latest=(await engagement(buyer).messages(req(),id)).data;expect(latest).toHaveLength(100);expect(latest[0].sequence).toBe('106');expect(latest.at(-1)?.sequence).toBe('205');const previous=(await engagement(buyer).messages(req(),id,{before:'106'})).data,first=(await engagement(buyer).messages(req(),id,{before:previous[0].sequence})).data;expect([...first,...previous,...latest].map(m=>m.sequence)).toEqual(Array.from({length:205},(_,i)=>String(i+1)));
 const replay=(await engagement(buyer).messages(req(),id,{after:'198',limit:3})).data;expect(replay.map(m=>m.sequence)).toEqual(['199','200','201']);await expect(engagement(buyer).messages(req(),id,{after:'9223372036854775808'})).rejects.toBeDefined();expect(await unread(id,buyer)).toBe('205');
});
it('M03 simultaneous cursor writers cannot regress the accepted state',async()=>{
 const id=(await inquiry()).conversationId!;await send(id,people[0],'First');await send(id,people[0],'Second');const results=await Promise.allSettled([conversations(buyer).read(req(),id,{version:0,sequence:'1'}),conversations(buyer).read(req(),id,{version:0,sequence:'2'})]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);const cursor=(await conversations(buyer).cursor(req(),id)).data;expect(cursor.version).toBe(1);if(cursor.sequence==='1')await conversations(buyer).read(req(),id,{version:1,sequence:'2'});expect((await conversations(buyer).cursor(req(),id)).data.sequence).toBe('2');
});
