import '../support/env';
import {it,expect,afterAll} from 'vitest';
import {pool,transaction} from '../../packages/database/src/index';
import {createProcessor,workerActor,initializeSearch} from '../../apps/worker/src/processor';
import {listingFilters} from '../../packages/contracts/src/domain';
import {searchListings,compileListingSearch} from '../../apps/api/src/geography/search';
afterAll(()=>pool.end());
const origin=(process.env.INTEGRATION_WEB_URL||process.env.PUBLIC_WEB_URL||'http://localhost:8088');
async function get(query:Record<string,string>){return fetch(origin+'/api/v1/listings?'+new URLSearchParams(query));}
it('D02 exact city/decimal filters, UUID ties and opaque bounded cursors return the expected IDs without duplicates',async()=>{
 await initializeSearch();const price='900077.13',ids:string[]=[];
 try{
 for(let i=0;i<3;i++){
  const id=await transaction(workerActor,async c=>(await c.query(`INSERT INTO listings(unit_id,organization_id,owner_id,agent_id,slug,title,description,transaction,segment,currency,price,photos,status,published_at) SELECT unit_id,organization_id,owner_id,agent_id,$1,title,description,transaction,segment,currency,$2,photos,'published',now() FROM listings WHERE id='10000000-0000-4000-8000-000000002000' RETURNING id`,['typed-search-'+crypto.randomUUID(),price])).rows[0].id);ids.push(id);
  const eventId=await transaction(workerActor,async c=>(await c.query("INSERT INTO outbox(aggregate_id,kind,payload,dispatched_at) VALUES($1,'listing.published','{}',now()) RETURNING id",[id])).rows[0].id);await createProcessor()({data:{id:eventId}});
 }
  const criteria={city:'bj',minPrice:price,maxPrice:price,sort:'price_asc',limit:'2'};
  const firstResponse=await get(criteria);expect(firstResponse.status).toBe(200);const first=await firstResponse.json();expect(first.meta.searchMode).toBe('meilisearch');expect(first.data.map((d:any)=>d.id)).toEqual(ids.sort().slice(0,2));expect(first.meta.total).toBe(3);expect(first.meta.nextCursor).toBeTruthy();
  const second=await (await get({...criteria,cursor:first.meta.nextCursor})).json();expect(second.data.map((d:any)=>d.id)).toEqual(ids.slice(2));expect(second.meta.nextCursor).toBeNull();expect(new Set([...first.data,...second.data].map((d:any)=>d.id)).size).toBe(3);
  expect((await get({...criteria,city:'sh'})).status).toBe(200);expect((await (await get({...criteria,city:'sh'})).json()).data).toEqual([]);
  expect((await get({...criteria,cursor:first.meta.nextCursor+'corrupt'})).status).toBe(400);expect((await get({...criteria,cursor:first.meta.nextCursor,currency:'USD'})).status).toBe(400);
  const fallback=await searchListings(listingFilters.parse(criteria),'http://127.0.0.1:1');expect(fallback.meta).toMatchObject({searchMode:'sql',degraded:true,degradedReason:'search-unavailable'});expect(fallback.data.map(d=>d.id)).toEqual(ids.slice(0,2));
  // Withdraw immediately without an event: SQL hydration rejects the stale search document.
  await transaction(workerActor,c=>c.query("UPDATE listings SET status='paused',version=version+1 WHERE id=$1",[ids[0]]));
  const stale=await (await get(criteria)).json();expect(stale.meta).toMatchObject({searchMode:'sql',degraded:true,degradedReason:'index-not-current'});expect(stale.data.map((d:any)=>d.id)).toEqual(ids.slice(1));
 }finally{for(const id of ids){const eventId=await transaction(workerActor,async c=>{await c.query("UPDATE listings SET status='paused',version=version+1 WHERE id=$1",[id]);return(await c.query("INSERT INTO outbox(aggregate_id,kind,payload,dispatched_at) VALUES($1,'listing.paused','{}',now()) RETURNING id",[id])).rows[0].id;});await createProcessor()({data:{id:eventId}});}}
});
it('D02 rejects raw expressions, invalid ordering, ranges, mixed currencies and oversized pages',async()=>{
 for(const query of [{filter:'city = bj OR status = draft'},{city:'bj" OR status = draft'},{sort:'price; DROP TABLE listings'},{minPrice:'10',maxPrice:'2'},{minArea:'10',maxArea:'2'},{currency:'CNY,USD'},{limit:'51'},{page:'501'},{page:'500',limit:'50'},{district:'Haidian OR price >= 0'}])expect((await get(query)).status).toBe(400);
});
it('D02 canonical facets combine OR within each facet with AND between facets using parameters and quoted search values',()=>{
 const query=listingFilters.parse({district:'Chaoyang,Haidian,Chaoyang',features:'Elevator,Garden',minPrice:'0.01',maxArea:'0'}),compiled=compileListingSearch(query);
 expect(query.district).toBe('Chaoyang,Haidian');expect(compiled.values).toContainEqual(['Chaoyang','Haidian']);expect(compiled.filter).toContain('(district = "Chaoyang" OR district = "Haidian")');expect(compiled.filter).toContain('priceMinor >= 1');expect(compiled.where).toMatch(/"?features"? &&/);expect(compiled.where).not.toContain('Chaoyang');
});
