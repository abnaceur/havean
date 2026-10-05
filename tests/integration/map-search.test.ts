import '../support/env';
import {it,expect,afterAll} from 'vitest';
import {pool,transaction} from '../../packages/database/src/index';
import {workerActor,createProcessor,initializeSearch} from '../../apps/worker/src/processor';
afterAll(()=>pool.end());
const origin='http://localhost:8088';
async function response(path:string,query:Record<string,string>){const result=await fetch(origin+'/api/v1/'+path+'?'+new URLSearchParams(query));expect(result.status).toBe(200);return result.json();}
it('D05 map/list bounds use identical canonical criteria and only rounded public community positions; private coordinate sentinels never enter responses or projections',async()=>{
 await initializeSearch();const ids:string[]=[],privateLatitude='12.345678',privateLongitude='67.891234',price='7654321.19';
 const setup=await transaction(workerActor,async c=>{
  const base=(await c.query(`SELECT l.organization_id,l.owner_id,l.agent_id,u.community_id FROM listings l JOIN units u ON u.id=l.unit_id WHERE l.id='10000000-0000-4000-8000-000000002000'`)).rows[0];
  const communities=(await c.query(`SELECT id,ST_AsEWKT(location::geometry) AS original FROM communities WHERE id=$1 OR id=(SELECT co.id FROM communities co JOIN districts d ON d.id=co.district_id JOIN cities ci ON ci.id=d.city_id WHERE co.id<>$1 AND ci.slug='bj' ORDER BY co.id LIMIT 1) ORDER BY id`,[base.community_id])).rows;expect(communities.length).toBe(2);
  for(let index=0;index<communities.length;index++){
   const community=communities[index];await c.query('UPDATE communities SET location=ST_SetSRID(ST_MakePoint($1,$2),4326)::geography WHERE id=$3',[116.412345+index*.2,39.987654,community.id]);
   const unit=(await c.query("INSERT INTO units(community_id,organization_id,area,beds,living_rooms,baths,orientation,floor,elevator) VALUES($1,$2,90,2,1,1,'South',5,true) RETURNING id",[community.id,base.organization_id])).rows[0].id;
   await c.query('INSERT INTO unit_private_details(unit_id,organization_id,private_address,private_latitude,private_longitude) VALUES($1,$2,$3,$4,$5)',[unit,base.organization_id,'Private map fixture',privateLatitude,privateLongitude]);
   const id=(await c.query("INSERT INTO listings(unit_id,organization_id,owner_id,agent_id,slug,title,description,transaction,segment,currency,price,status,published_at) VALUES($1,$2,$3,$4,$5,'Map fixture','Synthetic map coordinate fixture','sale','residential','CNY',$6,'published',now()) RETURNING id",[unit,base.organization_id,base.owner_id,base.agent_id,'map-'+crypto.randomUUID(),price])).rows[0].id;ids.push(id);
  }return {communities};
 });
 const project=async(id:string)=>{const eventId=await transaction(workerActor,async c=>(await c.query("INSERT INTO outbox(aggregate_id,kind,payload,dispatched_at) VALUES($1,'listing.changed','{}',now()) RETURNING id",[id])).rows[0].id);await createProcessor()({data:{id:eventId}});};
 try{
  for(const id of ids)await project(id);
  const criteria={city:'bj',transaction:'sale',segment:'residential',minPrice:price,maxPrice:price,sort:'price_asc'};
  const all=await response('listings/map',criteria);expect(all.data.map((x:any)=>x.id).sort()).toEqual([...ids].sort());expect(all.meta.located).toBe(2);expect(all.meta.truncated).toBe(false);
  const bounded={...criteria,bounds:'116.4119,39.9879,116.4121,39.9881'};const list=await response('listings',bounded),map=await response('listings/map',bounded);expect(list.data.map((x:any)=>x.id)).toEqual([ids[0]]);expect(map.data.map((x:any)=>x.id)).toEqual([ids[0]]);expect(list.meta.degradedReason).toBe('spatial-sql-contract');expect(map.data[0]).toMatchObject({latitude:39.988,longitude:116.412});
  const detail=await response('listings/'+ids[0],{city:'bj'});
  const projection=await fetch(process.env.SEARCH_URL+'/indexes/listings/documents/'+ids[0],{headers:{Authorization:'Bearer '+process.env.SEARCH_KEY}}).then(r=>r.json());
  for(const item of [all,map,list,detail,projection]){const json=JSON.stringify(item);expect(json).not.toContain(privateLatitude);expect(json).not.toContain(privateLongitude);expect(json).not.toContain('private_latitude');expect(json).not.toContain('116.412345');}
  expect((await transaction(null,c=>c.query('SELECT unit_id FROM unit_private_details WHERE unit_id IN(SELECT unit_id FROM listings WHERE id=ANY($1::uuid[]))',[ids]))).rows).toEqual([]);
  await transaction(workerActor,c=>c.query("UPDATE listings SET status='paused',version=version+1 WHERE id=$1",[ids[0]]));expect((await response('listings/map',bounded)).data).toEqual([]);
 }finally{for(const id of ids){await transaction(workerActor,c=>c.query("UPDATE listings SET status='paused',version=version+1 WHERE id=$1",[id]));await project(id);}await transaction(workerActor,async c=>{for(const community of setup.communities)await c.query('UPDATE communities SET location=ST_GeomFromEWKT($1)::geography WHERE id=$2',[community.original,community.id]);});}
});
it('D05 malformed/out-of-range/reversed bounds are rejected for both map and list',async()=>{
 for(const bounds of ['0,0,0,1','1,0,0,1','0,1,1,0','-181,0,1,1','0,-91,1,1','0,0,181,1','0,0,1,91','NaN,0,1,1','0,0,1','0,0,1,1 OR 1=1'])for(const path of ['listings','listings/map'])expect((await fetch(origin+'/api/v1/'+path+'?'+new URLSearchParams({city:'bj',bounds}))).status).toBe(400);
});
