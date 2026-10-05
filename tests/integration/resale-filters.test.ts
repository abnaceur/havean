import '../support/env';
import {it,expect,afterAll} from 'vitest';
import {pool,transaction} from '../../packages/database/src/index';
import {compileListingSearch} from '../../apps/api/src/geography/search';
import {listingFilters} from '../../packages/contracts/src/domain';
import {createProcessor,initializeSearch,workerActor} from '../../apps/worker/src/processor';
afterAll(()=>pool.end());
const origin='http://localhost:8088';
async function get(query:Record<string,string>){const response=await fetch(origin+'/api/v1/listings?'+new URLSearchParams(query));expect(response.status).toBe(200);return response.json();}
async function project(id:string){const eventId=await transaction(workerActor,async c=>(await c.query("INSERT INTO outbox(aggregate_id,kind,payload,dispatched_at) VALUES($1,'listing.changed','{}',now()) RETURNING id",[id])).rows[0].id);await createProcessor()({data:{id:eventId}});}
it('D04 combined resale facets use OR within groups and AND between them, including actual public tour eligibility and bounded transit proximity',async()=>{
 await initializeSearch();const sentinel='PRIVATE-FACET-'+crypto.randomUUID(),ids:string[]=[],price='1231231.47';
 const setup=await transaction(workerActor,async c=>{
  const base=(await c.query(`SELECT l.organization_id,l.owner_id,l.agent_id,u.community_id,co.neighborhood_id,co.district_id,d.city_id FROM listings l JOIN units u ON u.id=l.unit_id JOIN communities co ON co.id=u.community_id JOIN districts d ON d.id=co.district_id WHERE l.id='10000000-0000-4000-8000-000000002000'`)).rows[0];
  const building=(await c.query("INSERT INTO buildings(community_id,slug,name,floors,completed_year,building_type) VALUES($1,$2,'Facet building',18,$3,'Tower') RETURNING id",[base.community_id,'facet-'+crypto.randomUUID(),new Date().getUTCFullYear()-10])).rows[0].id;
  const line=(await c.query("INSERT INTO transit_lines(city_id,slug,name) VALUES($1,$2,'Facet line') RETURNING id",[base.city_id,'facet-'+crypto.randomUUID()])).rows[0].id;
  const station=(await c.query("INSERT INTO transit_stations(city_id,line_id,district_id,slug,name,latitude,longitude) SELECT $1,$2,$3,$4,'Facet station',ST_Y(location::geometry),ST_X(location::geometry) FROM communities WHERE id=$5 RETURNING id",[base.city_id,line,base.district_id,'facet-'+crypto.randomUUID(),base.community_id])).rows[0].id;
  for(const beds of [2,3]){
   const unit=(await c.query("INSERT INTO units(community_id,organization_id,area,beds,living_rooms,baths,orientation,floor,elevator,building_id) VALUES($1,$2,90,$3,2,1,'South',15,true,$4) RETURNING id",[base.community_id,base.organization_id,beds,building])).rows[0].id;
   await c.query('INSERT INTO unit_private_details(unit_id,organization_id,private_address) VALUES($1,$2,$3)',[unit,base.organization_id,sentinel]);
   const id=(await c.query("INSERT INTO listings(unit_id,organization_id,owner_id,agent_id,slug,title,description,transaction,segment,currency,price,features,status,published_at) VALUES($1,$2,$3,$4,$5,'Facet fixture','Public synthetic facet fixture','sale','residential','CNY',$6,$7,'published',now()) RETURNING id",[unit,base.organization_id,base.owner_id,base.agent_id,'facet-'+crypto.randomUUID(),price,[beds===2?'Garden views':'Near metro']])).rows[0].id;ids.push(id);
   await c.query("INSERT INTO residential_details(listing_id,finishing,heating,ownership_attributes,holding_period_attributes) VALUES($1,'Refined','Central',ARRAY['Freehold'],ARRAY['Over 5 years'])",[id]);
   const asset=(await c.query("INSERT INTO media_assets(owner_id,listing_id,object_key,mime,size,rights,visibility,status,purpose,width,height,scan_at) VALUES($1,$2,$3,'image/jpeg',100,'Synthetic authorized fixture','public','approved','panorama',2048,1024,now()) RETURNING id",[workerActor.id,id,'facet/'+crypto.randomUUID()])).rows[0].id;
   await c.query("INSERT INTO listing_media(listing_id,asset_id,kind,title,status,submitted_by) VALUES($1,$2,'panorama','Facet tour','approved',$3)",[id,asset,workerActor.id]);
  }return {...base,line,station,building};
 });
 try{
  for(const id of ids)await project(id);
  const query={city:'bj',transaction:'sale',segment:'residential',minPrice:price,maxPrice:price,district:'Chaoyang,Haidian',beds:'2,3',livingRooms:'1,2',features:'Garden views,Near metro',orientation:'South,North',floorCategory:'High,Low',minAge:'9',maxAge:'11',buildingType:'Tower',finishing:'Refined',heating:'Central',ownership:'Freehold',holdingPeriod:'Over 5 years',tourAvailable:'true',recentDays:'7',communityId:setup.community_id,neighborhoodId:setup.neighborhood_id,sort:'price_asc'};
  const compiled=compileListingSearch(listingFilters.parse(query));const engine=await fetch(process.env.SEARCH_URL+'/indexes/listings/search',{method:'POST',headers:{Authorization:'Bearer '+process.env.SEARCH_KEY,'Content-Type':'application/json'},body:JSON.stringify({q:'',filter:compiled.filter,sort:compiled.indexOrder})}).then(r=>r.json());expect(engine,engine.message).not.toHaveProperty('code');expect(engine.hits.map((hit:any)=>hit.id)).toEqual(ids.sort());
  const indexed=await get(query);expect(indexed.data.map((x:any)=>x.id)).toEqual(ids.sort());expect(indexed.meta.searchMode).toBe('meilisearch');expect(JSON.stringify(indexed)).not.toContain(sentinel);
  const transit=await get({...query,lineId:setup.line,stationId:setup.station});expect(transit.data.map((x:any)=>x.id)).toEqual(ids);expect(transit.meta.degradedReason).toBe('spatial-sql-contract');
  for(const extra of [{beds:'4'},{floorCategory:'Middle'},{minAge:'11'},{finishing:'Unfinished'},{tourAvailable:'false'},{ownership:'Leasehold'}])expect((await get({...query,...extra})).data).toEqual([]);
  await transaction(workerActor,c=>c.query("UPDATE media_assets SET status='quarantined' WHERE listing_id=$1",[ids[0]]));expect((await get(query)).data.map((x:any)=>x.id)).toEqual([ids[1]]);
  const facetResponse=await fetch(origin+'/api/v1/listings/facets?city=bj').then(r=>r.json());expect(facetResponse.data.finishing).toContain('Refined');expect(JSON.stringify(facetResponse)).not.toContain(sentinel);
 }finally{for(const id of ids){await transaction(workerActor,c=>c.query("UPDATE listings SET status='paused',version=version+1 WHERE id=$1",[id]));await project(id);}await transaction(workerActor,async c=>{await c.query('UPDATE units SET building_id=NULL WHERE id IN(SELECT unit_id FROM listings WHERE id=ANY($1::uuid[]))',[ids]);await c.query('DELETE FROM buildings WHERE id=$1',[setup.building]);await c.query('DELETE FROM transit_stations WHERE id=$1',[setup.station]);await c.query('DELETE FROM transit_lines WHERE id=$1',[setup.line]);});}
});
it('D04 invalid facet options and build-age ranges are rejected; public presets come from market configuration',async()=>{
 for(const query of [{floorCategory:'Unknown'},{buildingType:'Invented'},{minAge:'11',maxAge:'10'},{beds:'1,99'},{lineId:'not-an-id'}])expect((await fetch(origin+'/api/v1/listings?'+new URLSearchParams(query))).status).toBe(400);
 const response=await fetch(origin+'/api/v1/config?city=bj').then(r=>r.json());expect(response.data.data.pricePresets).toContainEqual({label:'Up to 4 million',transaction:'sale',min:'0',max:'4000000'});
});
