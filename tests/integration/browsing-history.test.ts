import '../support/env';
import {it,expect,afterAll} from 'vitest';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {workerActor} from '../../apps/worker/src/processor';
import {BrowsingHistoryController} from '../../apps/api/src/engagement/browsing-history';
import {EngagementController} from '../../apps/api/src/engagement/controller';
import type {Identity} from '../../apps/api/src/platform/core';
import type {FastifyRequest} from 'fastify';
afterAll(()=>pool.end());
it('A03 history is opt-in, versioned, removable/clearable and scoped; archived favorites/history stay unavailable without private fields',async()=>{
 const first=crypto.randomUUID(),other=crypto.randomUUID();await transaction(workerActor,async c=>{for(const id of [first,other])await c.query("INSERT INTO profiles(id,subject,display_name,email) VALUES($1,$2,'History fixture','history@example.test')",[id,'history-'+id]);});
 const id=(await transaction(workerActor,async c=>(await c.query(`INSERT INTO listings(unit_id,organization_id,owner_id,agent_id,slug,title,description,transaction,segment,currency,price,photos,status,published_at) SELECT unit_id,organization_id,owner_id,agent_id,$1,'History public fixture',description,transaction,segment,currency,price,photos,'published',now() FROM listings WHERE id='10000000-0000-4000-8000-000000002000' RETURNING id`,['history-'+crypto.randomUUID()])))).rows[0].id;
 const actor=(user:string):Actor=>({id:user,orgId:null,roles:['consumer']}),identity=(user:string)=>({actor:async()=>actor(user)} as unknown as Identity),history=new BrowsingHistoryController(identity(first)),outsider=new BrowsingHistoryController(identity(other)),favorites=new EngagementController(identity(first));
 const req=(method='POST',path='/api/v1/me/history/'+id,key=crypto.randomUUID())=>({method,url:path,headers:{'idempotency-key':key}} as unknown as FastifyRequest);
 try{
  expect((await history.read(req('GET'))).data).toEqual({enabled:false,version:0,entries:[]});await expect(history.record(req(),id,{version:0,listingVersion:1})).rejects.toMatchObject({status:403});
  await expect(transaction(actor(first),c=>c.query('INSERT INTO browsing_history(user_id,listing_id) VALUES($1,$2)',[first,id]))).rejects.toMatchObject({code:'42501'});
  const pref=await history.preferences(req('PATCH','/api/v1/me/history/preferences'),{version:0,enabled:true});expect(pref.data).toMatchObject({enabled:true,version:1});const request=req(),input={version:1,listingVersion:1};const visit=await history.record(request,id,input);expect(visit.data).toMatchObject({version:2,entries:[{listing:{id,title:'History public fixture',available:true}}]});expect(await history.record(request,id,input)).toEqual(visit);expect((await history.read(req('GET'))).data.entries).toHaveLength(1);
  await expect(history.record(req(),id,{version:1,listingVersion:1})).rejects.toMatchObject({status:409});await expect(history.record(req(),id,{version:2,listingVersion:2})).rejects.toMatchObject({status:409});await expect(history.preferences(req('PATCH'),{version:2,enabled:true,userId:other})).rejects.toMatchObject({name:'ZodError'});
  await outsider.preferences(req('PATCH','/api/v1/me/history/preferences'),{version:0,enabled:true});await outsider.record(req(),id,{version:1,listingVersion:1});await favorites.favorite(req('PUT','/api/v1/me/favorites/'+id),id,{version:0,listingVersion:1});expect((await favorites.favorites(req('GET'))).data[0]).toMatchObject({id,available:true});
  await transaction(workerActor,c=>c.query("UPDATE listings SET status='archived',title='PRIVATE_ARCHIVED_TITLE',description='PRIVATE_ARCHIVED_DESCRIPTION',version=version+1 WHERE id=$1",[id]));
  const saved=(await favorites.favorites(req('GET'))).data;expect(saved).toContainEqual({id,available:false,title:'Saved property is unavailable'});const unavailable=(await history.read(req('GET'))).data;expect(unavailable.entries[0].listing).toEqual({id,available:false,title:'Previously viewed property is unavailable'});expect(JSON.stringify({saved,unavailable})).not.toContain('PRIVATE_ARCHIVED');
  await expect(history.record(req(),id,{version:2,listingVersion:2})).rejects.toMatchObject({status:404});expect((await transaction(actor(other),c=>c.query('SELECT * FROM browsing_history WHERE user_id=$1',[first]))).rows).toEqual([]);expect((await transaction(actor(other),c=>c.query('DELETE FROM browsing_history WHERE user_id=$1',[first]))).rowCount).toBe(0);
  expect((await history.remove(req('DELETE'),id,{version:2})).data).toMatchObject({version:3,entries:[]});expect((await outsider.read(req('GET'))).data.entries).toHaveLength(1);
  // Clearing and removal never alter another user's collection; repeated no-op clears do not bump versions.
  const live=(await transaction(actor(first),c=>c.query("SELECT id,version FROM public_listings WHERE slug='home-1'"))).rows[0];await history.record(req('POST','/api/v1/me/history/'+live.id),live.id,{version:3,listingVersion:live.version});
  expect((await outsider.clear(req('DELETE','/api/v1/me/history'),{version:2})).data).toMatchObject({version:3,entries:[]});expect((await outsider.clear(req('DELETE','/api/v1/me/history'),{version:3})).data.version).toBe(3);
  expect((await history.read(req('GET'))).data.entries).toHaveLength(1);expect((await history.clear(req('DELETE','/api/v1/me/history'),{version:4})).data.entries).toEqual([]);
  await history.preferences(req('PATCH','/api/v1/me/history/preferences'),{version:5,enabled:false});await expect(history.record(req(),id,{version:6,listingVersion:2})).rejects.toMatchObject({status:403});
  await favorites.unfavorite(req('DELETE','/api/v1/me/favorites/'+id),id,{version:1,listingVersion:null});expect((await favorites.favorites(req('GET'))).data).toEqual([]);
 }finally{await transaction(workerActor,async c=>{await c.query('DELETE FROM browsing_history WHERE user_id=ANY($1::uuid[])',[[first,other]]);await c.query('DELETE FROM browsing_history_settings WHERE user_id=ANY($1::uuid[])',[[first,other]]);await c.query('DELETE FROM favorites WHERE user_id=ANY($1::uuid[])',[[first,other]]);await c.query("UPDATE profiles SET state='archived' WHERE id=ANY($1::uuid[])",[[first,other]]);await c.query("UPDATE listings SET status='archived' WHERE id=$1",[id]);});}
});
