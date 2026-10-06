import '../support/env';
import {it,expect,afterAll} from 'vitest';
import type {FastifyRequest} from 'fastify';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {workerActor} from '../../apps/worker/src/processor';
import {DiscoveryEventsController} from '../../apps/api/src/engagement/discovery-events';
import {RankingBoostsController} from '../../apps/api/src/administration/ranking-boosts';
import type {Identity} from '../../apps/api/src/platform/core';
afterAll(()=>pool.end());
const origin=process.env.INTEGRATION_WEB_URL||process.env.PUBLIC_WEB_URL||'http://localhost:8088';
const consumer:Actor={id:'00000000-0000-4000-8000-000000000001',orgId:null,roles:['consumer']};
function controller<T>(factory:(identity:Identity)=>T,actor:Actor){return factory({actor:async()=>actor} as unknown as Identity);}
function request(path:string,key=crypto.randomUUID()){return {method:'POST',url:'/api/v1'+path,headers:{'idempotency-key':key}} as unknown as FastifyRequest;}
async function read(path:string,criteria:Record<string,string>){const response=await fetch(origin+'/api/v1/'+path+'?'+new URLSearchParams(criteria));expect(response.status).toBe(200);return response.json();}
it('D06 known freshness/view/curated scores produce deterministic order, duplicate events cannot inflate it, and withdrawn or private data is excluded',async()=>{
 const preferenceController=controller(identity=>new DiscoveryEventsController(identity),consumer),priorConsent=(await preferenceController.consent(request('/me/analytics-consent'))).data;if(!priorConsent.enabled)await preferenceController.changeConsent(request('/me/analytics-consent'),{version:priorConsent.version,enabled:true});
 const ids:string[]=[],price='8765432.17',events=controller(identity=>new DiscoveryEventsController(identity),consumer),boosts=controller(identity=>new RankingBoostsController(identity),workerActor);
 await transaction(workerActor,async c=>{for(const age of [2,0,10,40])ids.push((await c.query(`INSERT INTO listings(unit_id,organization_id,owner_id,agent_id,slug,title,description,transaction,segment,currency,price,photos,status,published_at) SELECT unit_id,organization_id,owner_id,agent_id,$1,'Ranking fixture','Synthetic ranking test','sale','residential','CNY',$2,photos,'published',(date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')-$3*interval '1 day' FROM listings WHERE id='10000000-0000-4000-8000-000000002000' RETURNING id`,['rank-'+crypto.randomUUID(),price,age])).rows[0].id);});
 try{
  const eventId=crypto.randomUUID();expect((await events.view(request('/listings/'+ids[0]+'/view'),ids[0],{eventId,version:1,consent:true})).data.counted).toBe(true);
  expect((await events.view(request('/listings/'+ids[0]+'/view'),ids[0],{eventId,version:1,consent:true})).data.counted).toBe(false);
  const repeated=await Promise.all(Array.from({length:5},()=>events.view(request('/listings/'+ids[0]+'/view'),ids[0],{eventId:crypto.randomUUID(),version:1,consent:true})));expect(repeated.every(x=>!x.data.counted)).toBe(true);
  const other=controller(identity=>new DiscoveryEventsController(identity),{...consumer,id:'00000000-0000-4000-8000-000000000005'});expect((await other.view(request('/listings/'+ids[0]+'/view'),ids[0],{eventId:crypto.randomUUID(),version:1,consent:true})).data.counted).toBe(true);
  expect((await events.view(request('/listings/'+ids[1]+'/view'),ids[1],{eventId:crypto.randomUUID(),version:1,consent:false})).data).toEqual({recorded:false,counted:false});
  await expect(events.view(request('/listings/'+ids[1]+'/view'),ids[1],{eventId,version:1,consent:true})).rejects.toMatchObject({status:409});
  await expect(events.view(request('/listings/'+ids[1]+'/view'),ids[1],{eventId:crypto.randomUUID(),version:99,consent:true})).rejects.toMatchObject({status:409});
  const base={resourceType:'listing',resourceId:ids[3],city:'bj',points:50,sponsored:true,publicLabel:'Synthetic Sponsor',startsAt:new Date(Date.now()-3600000).toISOString(),endsAt:new Date(Date.now()+86400000).toISOString(),status:'active'};
  const sponsored=(await boosts.create(request('/ops/ranking-boosts'),base)).data;await boosts.create(request('/ops/ranking-boosts'),{...base,resourceId:ids[2],points:10,sponsored:false,publicLabel:'Curated fixture'});
  const criteria={city:'bj',transaction:'sale',segment:'residential',minPrice:price,maxPrice:price,period:'7d'};
  const result=await read('rankings',criteria);expect(result.data.map((x:any)=>x.id)).toEqual([ids[3],ids[0],ids[1],ids[2]]);expect(result.data.map((x:any)=>x.rankingScore)).toEqual([50,32,30,30]);expect(result.data.find((x:any)=>x.id===ids[0]).viewCount).toBe(2);expect(result.data[0]).toMatchObject({sponsored:true,curationLabel:'Synthetic Sponsor'});expect(result.meta).toMatchObject({ruleVersion:1,period:'7d'});expect(Date.parse(result.meta.periodEnd)-Date.parse(result.meta.periodStart)).toBe(7*86400000);
  const json=JSON.stringify(result);for(const field of ['user_id','created_by','updated_by',consumer.id,workerActor.id])expect(json).not.toContain(field);
  expect((await transaction(null,c=>c.query('SELECT * FROM listing_view_events'))).rows).toEqual([]);expect((await transaction(consumer,c=>c.query('SELECT * FROM curated_boosts'))).rows).toEqual([]);
  await expect(transaction(consumer,c=>c.query('UPDATE curated_boosts SET points=100 WHERE id=$1 RETURNING id',[sponsored.id]))).resolves.toMatchObject({rowCount:0});
  await expect(boosts.update(request('/ops/ranking-boosts/'+sponsored.id),sponsored.id,{...base,version:99})).rejects.toMatchObject({status:409});
  await expect(boosts.create(request('/ops/ranking-boosts'),{...base,resourceId:ids[1],city:'sh'})).rejects.toMatchObject({status:400});
  await expect(boosts.update(request('/ops/ranking-boosts/'+sponsored.id),sponsored.id,{...base,city:'sh',version:1})).rejects.toMatchObject({status:400});
  const paused=(await boosts.update(request('/ops/ranking-boosts/'+sponsored.id),sponsored.id,{...base,status:'paused',version:1})).data;expect(paused.version).toBe(2);expect((await read('rankings',criteria)).data[0].id).toBe(ids[0]);
  await boosts.update(request('/ops/ranking-boosts/'+sponsored.id),sponsored.id,{...base,version:2});const {period:_,...listCriteria}=criteria;const detail=await fetch(origin+'/api/v1/listings/'+ids[3]).then(r=>r.json());expect(detail.data).toMatchObject({sponsored:true,curationLabel:'Synthetic Sponsor'});for(const path of ['listings','listings/map']){const disclosed=await read(path,{...listCriteria,sort:'price_asc'});expect(disclosed.data.find((x:any)=>x.id===ids[3])).toMatchObject({sponsored:true,curationLabel:'Synthetic Sponsor'});}const list=await read('listings',listCriteria);expect(list.data.map((x:any)=>x.id)).toEqual([ids[3],ids[0],ids[1],ids[2]]);expect(list.meta).toMatchObject({queryPlan:'ranking-v1',searchMode:'sql',degraded:false});
  await transaction(workerActor,c=>c.query("UPDATE listings SET published_at=NULL WHERE id=$1",[ids[3]]));expect((await read('rankings',criteria)).data.find((x:any)=>x.id===ids[3]).rankingScore).toBe(50);
  await transaction(workerActor,c=>c.query("UPDATE listings SET status='paused',version=version+1 WHERE id=$1",[ids[3]]));expect((await read('rankings',criteria)).data.map((x:any)=>x.id)).toEqual([ids[0],ids[1],ids[2]]);expect((await fetch(origin+'/api/v1/listings/'+ids[3]+'/similar')).status).toBe(404);
  const similar=await fetch(origin+'/api/v1/listings/'+ids[0]+'/similar').then(r=>r.json());expect(similar.data.every((x:any)=>x.id!==ids[0]&&x.city==='bj'&&x.transaction==='sale'&&x.segment==='residential')).toBe(true);
 }finally{if(!priorConsent.enabled){const current=(await preferenceController.consent(request('/me/analytics-consent'))).data;if(current.enabled)await preferenceController.changeConsent(request('/me/analytics-consent'),{version:current.version,enabled:false});}await transaction(workerActor,async c=>{await c.query('DELETE FROM curated_boosts WHERE resource_type=\'listing\' AND resource_id=ANY($1::uuid[])',[ids]);await c.query('DELETE FROM listing_view_events WHERE listing_id=ANY($1::uuid[])',[ids]);await c.query("UPDATE listings SET status='paused',version=version+1 WHERE id=ANY($1::uuid[])",[ids]);});}
});
it('D06 public ranking rejects unsupported periods/sorts; development recommendations remain city/availability scoped',async()=>{
 for(const query of [{period:'forever'},{sort:'price_asc'},{period:'7d',cursor:'fabricated'}])expect((await fetch(origin+'/api/v1/rankings?'+new URLSearchParams(query))).status).toBe(400);
 const eligible=(await transaction(null,c=>c.query("SELECT de.id FROM developments de JOIN communities co ON co.id=de.community_id JOIN districts d ON d.id=co.district_id JOIN cities ci ON ci.id=d.city_id WHERE ci.slug='bj' AND de.status IN('on_sale','coming_soon')"))).rows.map(x=>x.id);const result=await read('recommendations/developments',{city:'bj'});expect(result.data.every((x:any)=>eligible.includes(x.id)&&['on_sale','coming_soon'].includes(x.status))).toBe(true);expect((await read('recommendations/developments',{city:'sh'})).data).toEqual([]);
});
