import {createHash,randomUUID} from 'node:crypto';
import type pg from 'pg';
import {transaction,pool,event} from '@haven/database';
import {config} from '@haven/config';
import {listingSearchSettings,publicListingSearchDocument,listingSearchSchemaVersion} from '@haven/contracts';
import {searchTask,workerActor} from './processor.js';

type Source={id:string;version:number;tombstone:boolean;document:unknown};
type Options={database?:pg.Pool;searchUrl?:string;afterPopulate?:(temporaryIndex:string)=>Promise<void>};
const maximum=100000,batchSize=1000;
function canonical(value:any):any{
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
 return value;
}
function digest(value:unknown){return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');}
function documents(rows:Source[]){return rows.filter(row=>!row.tombstone).map(row=>publicListingSearchDocument(row.document));}
function publicDigest(rows:any[]){return digest([...rows].sort((a,b)=>a.id.localeCompare(b.id)));}
async function snapshot(c:pg.PoolClient):Promise<Source[]>{
 const rows=(await c.query(`SELECT l.id,l.version,p.id IS NULL AS tombstone,to_jsonb(p) AS document FROM listings l LEFT JOIN public_listings p ON p.id=l.id ORDER BY l.id LIMIT $1`,[maximum+1])).rows;
 if(rows.length>maximum)throw Error('SEARCH_REBUILD_CAPACITY_EXCEEDED');
 return rows;
}
async function read(path:string,searchUrl:string){
 const response=await fetch(searchUrl+path,{headers:{Authorization:'Bearer '+config().SEARCH_KEY},signal:AbortSignal.timeout(5000)});
 if(!response.ok)throw Error('SEARCH_REBUILD_READ_FAILED_'+response.status);
 return response.json() as Promise<any>;
}
/** Internal operator capability: full public-only rebuild, with SQL still serving
 * consumers. The retained temporary UID holds the prior generation after swap. */
export async function rebuildSearch(options:Options={}){
 const searchUrl=options.searchUrl||config().SEARCH_URL,rebuildId=randomUUID(),temporary='listings_rebuild_'+rebuildId.replaceAll('-',''),startedAt=new Date().toISOString();
 let created=false,swapRequested=false;
 try{return await transaction(workerActor,async c=>{
  // Exclusive rebuilds and shared ordinary projection writes serialize across
  // processes. SQL publication writes continue; a changed source aborts swap.
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended('listings-search-rebuild',0))");
  const source=await snapshot(c),sourceSignature=digest(source),docs=documents(source),expectedHash=publicDigest(docs);
  await searchTask('/indexes','POST',{uid:temporary,primaryKey:'id'},searchUrl);created=true;
  await searchTask('/indexes/'+temporary+'/settings','PATCH',listingSearchSettings,searchUrl);
  for(let offset=0;offset<docs.length;offset+=batchSize)await searchTask('/indexes/'+temporary+'/documents','PUT',docs.slice(offset,offset+batchSize),searchUrl);
  await options.afterPopulate?.(temporary);
  const statistics=await read('/indexes/'+temporary+'/stats',searchUrl);
  if(statistics.numberOfDocuments!==docs.length)throw Error('SEARCH_REBUILD_COUNT_MISMATCH');
  const actual:any[]=[];
  for(let offset=0;offset<docs.length;offset+=batchSize){const page=await read('/indexes/'+temporary+'/documents?limit='+batchSize+'&offset='+offset,searchUrl);if(!Array.isArray(page.results))throw Error('SEARCH_REBUILD_DOCUMENTS_INVALID');actual.push(...page.results);}
  if(actual.length!==docs.length||publicDigest(actual)!==expectedHash)throw Error('SEARCH_REBUILD_DOCUMENT_MISMATCH');
  if(digest(await snapshot(c))!==sourceSignature)throw Error('SEARCH_REBUILD_SOURCE_CHANGED');
  const current=await fetch(searchUrl+'/indexes/listings',{headers:{Authorization:'Bearer '+config().SEARCH_KEY},signal:AbortSignal.timeout(5000)});
  if(current.status===404)await searchTask('/indexes','POST',{uid:'listings',primaryKey:'id'},searchUrl);
  else if(!current.ok)throw Error('SEARCH_REBUILD_CURRENT_UNAVAILABLE');
  // If the request outcome is uncertain, retain both generations for operator
  // inspection. Never delete a UID that may now contain the rollback generation.
  swapRequested=true;await searchTask('/swap-indexes','POST',[{indexes:['listings',temporary]}],searchUrl);
  for(let offset=0;offset<source.length;offset+=batchSize){
   const markers=source.slice(offset,offset+batchSize).map(row=>({id:row.id,version:row.version,tombstone:row.tombstone}));
   await c.query(`INSERT INTO projection_versions(aggregate_id,projection,source_version,tombstone) SELECT id,'listings',version,tombstone FROM jsonb_to_recordset($1::jsonb) AS row(id uuid,version int,tombstone boolean) ON CONFLICT(aggregate_id,projection) DO UPDATE SET source_version=EXCLUDED.source_version,tombstone=EXCLUDED.tombstone,updated_at=now()`,[JSON.stringify(markers)]);
  }
  await event(c,workerActor,rebuildId,'search.rebuilt',{sourceCount:docs.length,verifiedCount:actual.length,schemaVersion:listingSearchSchemaVersion,publicHash:expectedHash,retainedPreviousIndex:temporary});
  return {rebuildId,status:'swapped' as const,sourceCount:docs.length,verifiedCount:actual.length,publicHash:expectedHash,schemaVersion:listingSearchSchemaVersion,retainedPreviousIndex:temporary,startedAt,completedAt:new Date().toISOString()};
 },options.database||pool);
 }catch(error){
  if(created&&!swapRequested)try{await searchTask('/indexes/'+temporary,'DELETE',undefined,searchUrl);}catch{/* Failed candidates are never selected for serving. */}
  throw error;
 }
}
