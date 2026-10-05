import '../support/env';
import {it,expect,afterAll} from 'vitest';
import {pool,transaction} from '../../packages/database/src/index';
import {rebuildSearch} from '../../apps/worker/src/search-rebuild';
import {searchTask,createProcessor,workerActor} from '../../apps/worker/src/processor';
import {publicListingSearchDocument,listingFilters} from '../../packages/contracts/src/index';
import {searchListings} from '../../apps/api/src/geography/search';
import {HealthController} from '../../apps/api/src/platform/health';
import type {Identity} from '../../apps/api/src/platform/core';
import type {FastifyRequest} from 'fastify';
afterAll(()=>pool.end());
const origin='http://localhost:8088',headers={Authorization:'Bearer '+process.env.SEARCH_KEY};
async function read(path:string){const r=await fetch(process.env.SEARCH_URL+path,{headers});expect(r.ok).toBe(true);return r.json();}
async function fixture(){return transaction(workerActor,async c=>(await c.query(`INSERT INTO listings(unit_id,organization_id,owner_id,agent_id,slug,title,description,transaction,segment,currency,price,photos,status,published_at) SELECT unit_id,organization_id,owner_id,agent_id,$1,'D10 rebuild fixture','Public synthetic rebuild fixture','sale','residential','CNY','2111111.11',photos,'published',now() FROM listings WHERE id='10000000-0000-4000-8000-000000002000' RETURNING id`,['rebuild-'+crypto.randomUUID()])).rows[0].id);}
it('D10 verified temporary rebuild preserves the old serving index and browsing, then swaps the complete eligible public count and catches queued projections',async()=>{
 const id=await fixture(),ghost=crypto.randomUUID(),sentinel='PRIVATE-LEGACY-'+crypto.randomUUID();let projection:Promise<void>|undefined,backup='';
 try{
  const doc=await transaction(workerActor,async c=>publicListingSearchDocument((await c.query('SELECT * FROM public_listings WHERE id=$1',[id])).rows[0]));
  await searchTask('/indexes/listings/documents','PUT',[{...doc,id:ghost,internal_note:sentinel}]);
  const eventId=await transaction(workerActor,async c=>(await c.query("INSERT INTO outbox(aggregate_id,kind,payload,dispatched_at) VALUES($1,'listing.published','{}',now()) RETURNING id",[id])).rows[0].id);
  let finished=false;
  const result=await rebuildSearch({afterPopulate:async temporary=>{
   expect((await read('/indexes/'+temporary+'/stats')).numberOfDocuments).toBeGreaterThan(0);
   expect((await read('/indexes/listings/documents/'+ghost)).internal_note).toBe(sentinel);
   const browsing=await fetch(origin+'/api/v1/listings?city=bj&sort=newest');expect(browsing.status).toBe(200);const body=await browsing.json();expect(body.data.length).toBeGreaterThan(0);expect(body.meta.total).toBeGreaterThan(0);expect(JSON.stringify(body)).not.toContain(sentinel);
   projection=createProcessor()({data:{id:eventId}}).then(()=>{finished=true;});await new Promise(resolve=>setTimeout(resolve,75));expect(finished).toBe(false);
  }});backup=result.retainedPreviousIndex;await projection;expect(finished).toBe(true);
  const expected=await transaction(workerActor,async c=>Number((await c.query('SELECT count(*) FROM public_listings')).rows[0].count));expect(result).toMatchObject({status:'swapped',sourceCount:expected,verifiedCount:expected,schemaVersion:3});expect(result.publicHash).toMatch(/^[a-f0-9]{64}$/);
  await transaction(workerActor,async c=>{expect((await c.query("SELECT count(*)::int AS n FROM audit_events WHERE resource_id=$1 AND action='search.rebuilt'",[result.rebuildId])).rows[0].n).toBe(1);expect((await c.query("SELECT count(*)::int AS n FROM outbox WHERE aggregate_id=$1 AND kind='search.rebuilt'",[result.rebuildId])).rows[0].n).toBe(1);});
  expect((await read('/indexes/listings/stats')).numberOfDocuments).toBe(expected);expect((await fetch(process.env.SEARCH_URL+'/indexes/listings/documents/'+ghost,{headers})).status).toBe(404);expect((await read('/indexes/listings/documents/'+id))).not.toHaveProperty('internal_note');expect((await read('/indexes/'+backup+'/documents/'+ghost)).internal_note).toBe(sentinel);
  const metrics=new HealthController({actor:async()=>workerActor} as unknown as Identity);expect((await metrics.metrics({} as FastifyRequest)).data.search).toMatchObject({staleListings:0,providerAvailable:true,indexedDocuments:expected,schemaVersion:3});expect((await fetch(origin+'/api/v1/health/metrics')).status).toBe(401);
 }finally{await projection;await transaction(workerActor,c=>c.query("UPDATE listings SET status='paused',version=version+1 WHERE id=$1",[id]));await rebuildSearch();if(backup)await searchTask('/indexes/'+backup,'DELETE');}
},60000);
it('D10 candidate content corruption and changed SQL source abort swap; network outage uses explicit nonempty SQL degradation',async()=>{
 const id=await fixture();let failedTemporary='';
 try{
  await rebuildSearch();const before=(await read('/indexes/listings/documents/'+id)).price;
  await expect(rebuildSearch({afterPopulate:async temporary=>{failedTemporary=temporary;const row=await read('/indexes/'+temporary+'/documents/'+id);await searchTask('/indexes/'+temporary+'/documents','PUT',[{...row,price:'1.00'}]);}})).rejects.toThrow('SEARCH_REBUILD_DOCUMENT_MISMATCH');expect((await read('/indexes/listings/documents/'+id)).price).toBe(before);expect((await fetch(process.env.SEARCH_URL+'/indexes/'+failedTemporary,{headers})).status).toBe(404);
  await expect(rebuildSearch({afterPopulate:async()=>{await transaction(workerActor,c=>c.query("UPDATE listings SET price='2111112.12',version=version+1 WHERE id=$1",[id]));}})).rejects.toThrow('SEARCH_REBUILD_SOURCE_CHANGED');expect((await read('/indexes/listings/documents/'+id)).price).toBe(before);
  const criteria=listingFilters.parse({city:'bj',sort:'newest',minPrice:'2111112.12',maxPrice:'2111112.12'}),current=await searchListings(criteria);expect(current.data.map(x=>x.id)).toEqual([id]);expect(current.meta).toMatchObject({searchMode:'sql',degraded:true,degradedReason:'index-not-current'});
  const outage=await searchListings(criteria,'http://127.0.0.1:1');expect(outage.data.map(x=>x.id)).toEqual([id]);expect(outage.meta).toMatchObject({searchMode:'sql',degraded:true,degradedReason:'search-unavailable'});
  await expect(rebuildSearch({searchUrl:'http://127.0.0.1:1'})).rejects.toThrow();expect((await read('/indexes/listings/documents/'+id)).price).toBe(before);
 }finally{await transaction(workerActor,c=>c.query("UPDATE listings SET status='paused',version=version+1 WHERE id=$1",[id]));await rebuildSearch();}
},60000);
