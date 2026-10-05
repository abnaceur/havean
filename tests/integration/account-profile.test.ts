import '../support/env';
import {it,expect,afterAll} from 'vitest';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {workerActor} from '../../apps/worker/src/processor';
import {ProfileController} from '../../apps/api/src/identity/profile';
import {IdentityController} from '../../apps/api/src/identity/controller';
import type {Identity} from '../../apps/api/src/platform/core';
import type {FastifyRequest} from 'fastify';
afterAll(()=>pool.end());
it('A01 versioned own profile persists, replay is audited once, other profiles/identity fields are denied and inactive profiles cannot be edited',async()=>{
 const id=crypto.randomUUID();await transaction(workerActor,c=>c.query("INSERT INTO profiles(id,subject,display_name,email) VALUES($1,$2,'Initial profile','profile@example.test')",[id,'profile-fixture-'+id]));
 const actor:Actor={id,orgId:null,roles:['consumer']},identity={actor:async()=>actor} as unknown as Identity,profiles=new ProfileController(identity),me=new IdentityController(identity);
 const req=(key=crypto.randomUUID())=>({method:'PATCH',url:'/api/v1/profiles/'+id,headers:{'idempotency-key':key}} as unknown as FastifyRequest);
 try{
  const input={displayName:'  Local profile name  ',locale:'en-US',version:1},request=req();const first=await profiles.update(request,id,input);expect(first.data).toMatchObject({id,displayName:'Local profile name',locale:'en-US',version:2,email:'profile@example.test',emailVerified:null,contactSyncedAt:null});expect(first.data.identityAccountUrl).toMatch(/\/realms\/haven\/account\/$/);expect((await me.me(req())).data).toMatchObject({displayName:'Local profile name',version:2});expect(await profiles.update(request,id,input)).toEqual(first);
  await transaction(workerActor,async c=>{expect((await c.query("SELECT count(*)::int AS n FROM audit_events WHERE actor_id=$1 AND action='account.profile_updated'",[id])).rows[0].n).toBe(1);expect((await c.query("SELECT count(*)::int AS n FROM outbox WHERE aggregate_id=$1 AND kind='account.profile_updated'",[id])).rows[0].n).toBe(1);});
  await expect(profiles.update(req(),'00000000-0000-4000-8000-000000000001',input)).rejects.toMatchObject({status:404});await expect(profiles.update(req(),id,{...input,version:1})).rejects.toMatchObject({status:409});
  for(const invalid of [{displayName:' ',locale:'en-US',version:2},{displayName:'a'.repeat(81),locale:'en-US',version:2},{...input,locale:'unknown',version:2},{...input,email:'other@example.test',version:2},{...input,userId:'00000000-0000-4000-8000-000000000001',version:2},{...input,roles:['admin'],version:2}])await expect(profiles.update(req(),id,invalid)).rejects.toMatchObject({name:'ZodError'});
  await expect(transaction(actor,c=>c.query("UPDATE profiles SET display_name='Unauthorized',version=version+1 WHERE id='00000000-0000-4000-8000-000000000001'"))).rejects.toMatchObject({code:'42501'});
  await expect(transaction(actor,c=>c.query("UPDATE profiles SET email='unauthorized@example.test',version=version+1 WHERE id=$1",[id]))).rejects.toMatchObject({code:'42501'});
  await expect(transaction(actor,c=>c.query("UPDATE profiles SET display_name='Wrong version' WHERE id=$1",[id]))).rejects.toMatchObject({code:'40001'});
  expect((await me.me(req())).data).toMatchObject({displayName:'Local profile name',email:'profile@example.test',version:2});
  await transaction(workerActor,c=>c.query("UPDATE profiles SET state='suspended' WHERE id=$1",[id]));await expect(profiles.update(req(),id,{...input,version:2})).rejects.toMatchObject({status:404});
 }finally{await transaction(workerActor,c=>c.query("UPDATE profiles SET state='archived' WHERE id=$1",[id]));}
});
