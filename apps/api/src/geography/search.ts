import {createHash} from 'node:crypto';
import type {z} from 'zod';
import {listingFilters,exactPriceMinor,listingSearchSchemaVersion} from '@haven/contracts';
import {data,env,transaction,fail,encrypt,decrypt} from '../platform/core.js';
type Filters=z.output<typeof listingFilters>;
const orders={recommended:'"publishedAt" DESC NULLS LAST',newest:'"publishedAt" DESC NULLS LAST',price_asc:'price::numeric ASC NULLS LAST',price_desc:'price::numeric DESC NULLS LAST',area_desc:'area::numeric DESC'};
const indexOrders={recommended:['publishedOrder:desc','id:asc'],newest:['publishedOrder:desc','id:asc'],price_asc:['priceMissing:asc','priceMinor:asc','id:asc'],price_desc:['priceMissing:asc','priceMinor:desc','id:asc'],area_desc:['areaNumber:desc','id:asc']};
export function compileListingSearch(q:Filters){
 const values:unknown[]=[],sql:string[]=[],search:string[]=[];
 const add=(column:string,operator:string,value:unknown,indexColumn=column,indexValue=value)=>{values.push(value);sql.push(`${column}${operator}$${values.length}`);search.push(`${indexColumn} ${operator} ${JSON.stringify(indexValue)}`);};
 add('city','=',q.city);add('currency','=',q.currency||'CNY');
 for(const key of ['transaction','segment','rentPeriod','beds','livingRooms'] as const)if(q[key]!==undefined)add('"'+key+'"','=',q[key],key);
 for(const key of ['district','districtId','communityId','orientation','furnishing'] as const)if(q[key]){const list=q[key]!.split(',');values.push(list);sql.push(`"${key}"=ANY($${values.length}::text[])` .replace('"districtId"','"districtId"::text').replace('"communityId"','"communityId"::text'));search.push('('+list.map(v=>`${key} = ${JSON.stringify(v)}`).join(' OR ')+')');}
 if(q.features){const list=q.features.split(',');values.push(list);sql.push(`features && $${values.length}::text[]`);search.push('('+list.map(v=>`features = ${JSON.stringify(v)}`).join(' OR ')+')');}
 if(q.elevator)add('elevator','=',q.elevator==='true');
 if(q.minPrice!==undefined)add('price::numeric','>=',q.minPrice,'priceMinor',exactPriceMinor(q.minPrice));
 if(q.maxPrice!==undefined)add('price::numeric','<=',q.maxPrice,'priceMinor',exactPriceMinor(q.maxPrice));
 if(q.minArea!==undefined)add('area::numeric','>=',q.minArea,'areaNumber');
 if(q.maxArea!==undefined)add('area::numeric','<=',q.maxArea,'areaNumber');
 if(q.text){values.push('%'+q.text.replace(/[\\%_]/g,'\\$&')+'%');sql.push(`(title ILIKE $${values.length} OR community ILIKE $${values.length} OR district ILIKE $${values.length})`);}
 search.push(`projectionSchemaVersion = ${listingSearchSchemaVersion}`);
 // No raw expressions, column names or ordering are taken from callers.
 return {values,where:sql.join(' AND '),filter:search.join(' AND '),order:orders[q.sort]+',id ASC',indexOrder:indexOrders[q.sort]};
}
function pageFor(q:Filters){
 const {page:_,cursor:__,...criteria}=q;
 const fingerprint=createHash('sha256').update(JSON.stringify(criteria)).digest('hex');
 let page=q.page;
 if(q.cursor){try{const token=decrypt<{page:number;fingerprint:string;expires:number}>(q.cursor);if(token.fingerprint!==fingerprint||token.expires<Date.now()||!Number.isInteger(token.page)||token.page<1||token.page>500)throw Error('INVALID_CURSOR');page=token.page;}catch{fail(400,'This search cursor is invalid or expired','INVALID_CURSOR');}}
 if((page-1)*q.limit>10000)fail(400,'Search page exceeds the bounded pagination limit','PAGE_LIMIT');
 return {page,fingerprint};
}
export async function searchListings(q:Filters,searchUrl=env.SEARCH_URL){
 const compiled=compileListingSearch(q),{page,fingerprint}=pageFor(q),offset=(page-1)*q.limit;
 return transaction(null,async c=>{
  const total=Number((await c.query(`SELECT count(*) FROM public_listings WHERE ${compiled.where}`,compiled.values)).rows[0].count);
  const rows=(await c.query(`SELECT * FROM public_listings WHERE ${compiled.where} ORDER BY ${compiled.order} LIMIT $${compiled.values.length+1} OFFSET $${compiled.values.length+2}`,[...compiled.values,q.limit,offset])).rows;
  let searchMode='sql',degradedReason:string|undefined;
  if(q.text)degradedReason='literal-text-contract';
  else try{
   const r=await fetch(searchUrl+'/indexes/listings/search',{method:'POST',headers:{Authorization:'Bearer '+env.SEARCH_KEY,'Content-Type':'application/json'},body:JSON.stringify({q:'',filter:compiled.filter,sort:compiled.indexOrder,offset,limit:q.limit,attributesToRetrieve:['id','sourceVersion','pricePrecisionSafe']}),signal:AbortSignal.timeout(1200)});
   if(!r.ok)throw Error('SEARCH_UNAVAILABLE');
   const result=await r.json() as {hits:{id:string;sourceVersion:number;pricePrecisionSafe:boolean}[];estimatedTotalHits:number};
   if(!Array.isArray(result.hits)||result.estimatedTotalHits!==total||result.hits.length!==rows.length||result.hits.some((hit,i)=>hit.id!==rows[i].id||hit.sourceVersion!==rows[i].version||!hit.pricePrecisionSafe))degradedReason='index-not-current';
   else searchMode='meilisearch';
  }catch{degradedReason='search-unavailable';}
  // Hydrate from current public SQL eligibility: queued withdrawal can never leak a document.
  const next=offset+rows.length<total&&page<500&&page*q.limit<=10000?encrypt({page:page+1,fingerprint,expires:Date.now()+3600000}):null;
  return data(rows,{total,page,limit:q.limit,searchMode,degraded:!!degradedReason,...(degradedReason?{degradedReason}:{}),pagination:'bounded-offset',maxOffset:10000,nextCursor:next});
 });
}
