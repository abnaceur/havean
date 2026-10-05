import '../support/env';
import {it,expect,afterAll} from 'vitest';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {workerActor} from '../../apps/worker/src/processor';
import {EngagementController} from '../../apps/api/src/engagement/controller';
import type {Identity} from '../../apps/api/src/platform/core';
import type {FastifyRequest} from 'fastify';
afterAll(()=>pool.end());
it('A02 own favorites persist, repeated desired-state writes/replays are idempotent, stale toggles and private listings are denied, and another actor cannot read or remove them',async()=>{
 const first=crypto.randomUUID(),other=crypto.randomUUID();await transaction(workerActor,async c=>{for(const id of [first,other])await c.query("INSERT INTO profiles(id,subject,display_name,email) VALUES($1,$2,'Favorite fixture','favorite@example.test')",[id,'favorite-'+id]);});
 const actor=(id:string):Actor=>({id,orgId:null,roles:['consumer']}),controller=(id:string)=>new EngagementController({actor:async()=>actor(id)} as unknown as Identity),owner=controller(first),outsider=controller(other);
 const listing=(await transaction(actor(first),c=>c.query("SELECT id,version FROM public_listings WHERE slug='home-1'"))).rows[0];
 const req=(method='PUT',key=crypto.randomUUID())=>({method,url:'/api/v1/me/favorites/'+listing.id,headers:{'idempotency-key':key}} as unknown as FastifyRequest);
 try{
  const initial=(await owner.favoriteState(req('GET'),listing.id)).data;expect(initial).toEqual({saved:false,version:0,listingVersion:listing.version});
  const request=req(),body={version:0,listingVersion:listing.version};const saved=await owner.favorite(request,listing.id,body);expect(saved.data).toMatchObject({saved:true,version:1});expect(await owner.favorite(request,listing.id,body)).toEqual(saved);
  expect((await owner.favorites(req('GET'))).data.map(row=>row.id)).toContain(listing.id);
  expect((await owner.favorite(req(),listing.id,{...body,version:1})).data).toMatchObject({saved:true,version:1});
  await expect(owner.unfavorite(req('DELETE'),listing.id,body)).rejects.toMatchObject({status:409});
  expect((await outsider.favorites(req('GET'))).data).toEqual([]);expect((await outsider.favoriteState(req('GET'),listing.id)).data.saved).toBe(false);
  expect((await outsider.unfavorite(req('DELETE'),listing.id,body)).data).toMatchObject({saved:false,version:0});expect((await owner.favoriteState(req('GET'),listing.id)).data.saved).toBe(true);
  expect((await transaction(actor(other),c=>c.query('SELECT * FROM favorites WHERE user_id=$1',[first]))).rows).toEqual([]);
  expect((await transaction(actor(other),c=>c.query('DELETE FROM favorites WHERE user_id=$1',[first]))).rowCount).toBe(0);
  const removed=await owner.unfavorite(req('DELETE'),listing.id,{...body,version:1});expect(removed.data).toMatchObject({saved:false,version:2});expect((await owner.favorites(req('GET'))).data).toEqual([]);
  await expect(owner.favorite(req(),listing.id,{...body,version:1})).rejects.toMatchObject({status:409});await expect(owner.favorite(req(),listing.id,{version:2,listingVersion:listing.version+1})).rejects.toMatchObject({status:409});
  await expect(owner.favorite(req(),'10000000-0000-4000-8000-000000002900',{version:0,listingVersion:1})).rejects.toMatchObject({status:404});
  await expect(owner.favorite(req(),listing.id,{...body,userId:other})).rejects.toMatchObject({name:'ZodError'});
  await transaction(workerActor,async c=>{expect((await c.query("SELECT count(*)::int n FROM audit_events WHERE actor_id=$1 AND action='favorite.saved'",[first])).rows[0].n).toBe(1);expect((await c.query("SELECT count(*)::int n FROM audit_events WHERE actor_id=$1 AND action='favorite.removed'",[first])).rows[0].n).toBe(1);expect((await c.query("SELECT count(*)::int n FROM favorites WHERE user_id=$1 AND listing_id=$2",[first,listing.id])).rows[0].n).toBe(1);});
 }finally{await transaction(workerActor,async c=>{await c.query('DELETE FROM favorites WHERE user_id=ANY($1::uuid[])',[[first,other]]);await c.query("UPDATE profiles SET state='archived' WHERE id=ANY($1::uuid[])",[[first,other]]);});}
});
