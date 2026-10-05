import '../support/env';
import {it,expect,afterAll} from 'vitest';
import {pool,transaction} from '../../packages/database/src/index';
import {createProcessor,workerActor,initializeSearch} from '../../apps/worker/src/processor';
import {exactPriceMinor,publicListingSearchDocument} from '../../packages/contracts/src/search-projection';
afterAll(()=>pool.end());
const headers={Authorization:'Bearer '+process.env.SEARCH_KEY,'Content-Type':'application/json'};
async function project(id:string,kind:string){
 const eventId=await transaction(workerActor,async c=>(await c.query('INSERT INTO outbox(aggregate_id,kind,payload,dispatched_at) VALUES($1,$2,$3,now()) RETURNING id',[id,kind,JSON.stringify({version:1})])).rows[0].id);
 await createProcessor()({data:{id:eventId}});
}
it('D01 approved public projection is searchable with exact decimal price and no private fields; old publication cannot resurrect withdrawal',async()=>{
 await initializeSearch();
 const marker='projection'+crypto.randomUUID().replaceAll('-',''),sentinel='PRIVATE-'+crypto.randomUUID();
 const id=await transaction(workerActor,async c=>(await c.query(`INSERT INTO listings(unit_id,organization_id,owner_id,agent_id,slug,title,description,transaction,segment,currency,price,photos,status,published_at) SELECT unit_id,organization_id,owner_id,agent_id,$1,$1,description,transaction,segment,currency,'900001.37',photos,'published',now() FROM listings WHERE id='10000000-0000-4000-8000-000000002000' RETURNING id`,[marker])).rows[0].id);
 try{
  const source=await transaction(workerActor,async c=>(await c.query('SELECT * FROM public_listings WHERE id=$1',[id])).rows[0]);
  const serialized=publicListingSearchDocument({...source,private_address:sentinel,owner_id:sentinel,internal_note:sentinel});
  expect(JSON.stringify(serialized)).not.toContain(sentinel);expect(serialized.price).toBe('900001.37');expect(serialized.priceMinor).toBe(90000137);
  await project(id,'listing.published');
  const search=await fetch(process.env.SEARCH_URL+'/indexes/listings/search',{method:'POST',headers,body:JSON.stringify({q:marker,filter:'city = "bj" AND priceMinor = 90000137 AND projectionSchemaVersion = 1'})}).then(r=>r.json());
  expect(search.hits.map((d:any)=>d.id)).toEqual([id]);expect(search.hits[0]).toMatchObject({price:'900001.37',sourceVersion:1,projectionSchemaVersion:1});
  for(const field of ['owner_id','organization_id','private_address','internal_note','created_by'])expect(search.hits[0]).not.toHaveProperty(field);
  await transaction(workerActor,c=>c.query("UPDATE listings SET status='paused',version=version+1 WHERE id=$1",[id]));
  await project(id,'listing.paused');await project(id,'listing.published');
  expect((await fetch(process.env.SEARCH_URL+'/indexes/listings/documents/'+id,{headers})).status).toBe(404);
  const projection=await transaction(workerActor,c=>c.query("SELECT source_version,tombstone FROM projection_versions WHERE aggregate_id=$1 AND projection='listings'",[id]));expect(projection.rows[0]).toEqual({source_version:2,tombstone:true});
 }finally{await transaction(workerActor,c=>c.query("UPDATE listings SET status='paused',version=version+1 WHERE id=$1",[id]));await project(id,'listing.paused');}
});
it('D01 numeric projection preserves cents, rejects malformed amounts and declares unsafe legacy prices for SQL comparison',()=>{
 expect(exactPriceMinor('0.01')).toBe(1);expect(exactPriceMinor('1000000000000.99')).toBe(100000000000099);expect(exactPriceMinor('9999999999999999.99')).toBeNull();expect(exactPriceMinor(null)).toBeNull();expect(()=>exactPriceMinor('1.001')).toThrow('INVALID_SEARCH_PRICE');
});
