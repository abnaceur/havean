import {publishDevelopmentFixture} from '../support/development-review';
import '../support/env';
import {it,expect,afterAll} from 'vitest';
import type {FastifyRequest} from 'fastify';
import {pool,transaction} from '../../packages/database/src/index';
import {workerActor} from '../../apps/worker/src/processor';
import {RankingBoostsController} from '../../apps/api/src/administration/ranking-boosts';
import type {Identity} from '../../apps/api/src/platform/core';
import {responses} from '../../packages/contracts/src/responses';
afterAll(()=>pool.end());
const origin='http://localhost:8088',boosts=new RankingBoostsController({actor:async()=>workerActor} as unknown as Identity);
const request=()=>({method:'POST',url:'/api/v1/ops/ranking-boosts',headers:{'idempotency-key':crypto.randomUUID()}} as unknown as FastifyRequest);
async function home(city='bj'){const response=await fetch(origin+'/api/v1/discovery/home?city='+city);expect(response.status).toBe(200);const result=await response.json();responses.HomeDiscoveryController_home.parse(result.data);return result;}
it('D07 city-scoped bounded home feeds show only active eligible curation and disclosed sponsorship; withdrawal/sold-out remove cards immediately',async()=>{
 const listings:string[]=[],developments:string[]=[];
 await transaction(workerActor,async c=>{
  for(const tx of ['sale','rent'])listings.push((await c.query(`INSERT INTO listings(unit_id,organization_id,owner_id,agent_id,slug,title,description,transaction,segment,currency,price,rent_period,photos,status,published_at) SELECT unit_id,organization_id,owner_id,agent_id,$1,'Homepage '||$2::text,'Synthetic home feed fixture',$2,'residential','CNY','1234567.89',CASE WHEN $2='rent' THEN 'month' ELSE NULL END,photos,'published',now() FROM listings WHERE id='10000000-0000-4000-8000-000000002000' RETURNING id`,['home-feed-'+crypto.randomUUID(),tx])).rows[0].id);
  developments.push((await c.query(`INSERT INTO developments(id,organization_id,community_id,slug,name,description,status,price_min,price_max,currency,price_basis,completion_date,photos,features,inventory_at) SELECT gen_random_uuid(),organization_id,community_id,$1,'Homepage project','Synthetic homepage project','draft',price_min,price_max,currency,price_basis,completion_date,photos,features,now() FROM developments WHERE status='on_sale' ORDER BY id LIMIT 1 RETURNING id`,['home-project-'+crypto.randomUUID()])).rows[0].id);
 });
 await publishDevelopmentFixture({...workerActor,orgId:'10000000-0000-4000-8000-000000000003'},developments[0],1,'coming_soon');
 try{
  const base={resourceType:'listing',resourceId:listings[0],city:'bj',points:100,sponsored:true,publicLabel:'Homepage synthetic sponsor',startsAt:new Date(Date.now()-3600000).toISOString(),endsAt:new Date(Date.now()+86400000).toISOString(),status:'active'};
  const placement=(await boosts.create(request(),base)).data;await boosts.create(request(),{...base,resourceType:'development',resourceId:developments[0],sponsored:false});
  await expect(boosts.create(request(),{...base,resourceId:listings[1],city:'sh'})).rejects.toMatchObject({status:400});
  await boosts.create(request(),{...base,resourceId:listings[1],startsAt:new Date(Date.now()+86400000).toISOString(),endsAt:new Date(Date.now()+172800000).toISOString()});
  const result=await home();expect(result.meta).toMatchObject({city:'bj',ruleVersion:1,period:'30d'});expect(result.data.resale[0].id).toBe(listings[0]);expect(result.data.curatedResale.find((x:any)=>x.id===listings[0])).toMatchObject({sponsored:true,curationLabel:base.publicLabel});expect(result.data.curatedResale.some((x:any)=>x.id===listings[1])).toBe(false);expect(result.data.curatedDevelopments[0]).toMatchObject({id:developments[0],city:'bj',sponsored:false});expect(result.data.rentals.some((x:any)=>x.id===listings[1]&&x.rentPeriod==='month')).toBe(true);
  for(const [key,limit] of [['resale',6],['rentals',3],['developments',3],['curatedResale',3],['curatedDevelopments',3]] as const){expect(result.data[key].length).toBeLessThanOrEqual(limit);expect(result.data[key].every((x:any)=>x.city==='bj')).toBe(true);}
  for(const field of ['created_by','organization_id','user_id','owner_id','private_address'])expect(JSON.stringify(result)).not.toContain(field);
  await boosts.update(request(),placement.id,{...base,status:'paused',version:1});expect((await home()).data.curatedResale.some((x:any)=>x.id===listings[0])).toBe(false);
  await transaction(workerActor,async c=>{await c.query("UPDATE listings SET status='paused',version=version+1 WHERE id=ANY($1::uuid[])",[listings]);await c.query("UPDATE developments SET status='sold_out',version=version+1 WHERE id=$1",[developments[0]]);});
  const unavailable=await home();expect(unavailable.data.resale.some((x:any)=>listings.includes(x.id))).toBe(false);expect(unavailable.data.rentals.some((x:any)=>listings.includes(x.id))).toBe(false);expect(unavailable.data.developments.some((x:any)=>developments.includes(x.id))).toBe(false);expect(unavailable.data.curatedDevelopments.some((x:any)=>developments.includes(x.id))).toBe(false);
 }finally{await transaction(workerActor,async c=>{await c.query('DELETE FROM curated_boosts WHERE resource_id=ANY($1::uuid[])',[[...listings,...developments]]);await c.query("UPDATE listings SET status='paused',version=version+1 WHERE id=ANY($1::uuid[])",[listings]);await c.query("UPDATE developments SET status='draft',version=version+1 WHERE id=ANY($1::uuid[])",[developments]);});}
});
it('D07 an empty selected city returns empty feeds rather than borrowing another city; malformed/unknown requests are explicit',async()=>{
 const result=await home('sh');for(const cards of Object.values(result.data))expect(cards).toEqual([]);expect((await fetch(origin+'/api/v1/discovery/home?city=unknown-city')).status).toBe(404);expect((await fetch(origin+'/api/v1/discovery/home?city=bj&invented=true')).status).toBe(400);
});
