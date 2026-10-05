import {createHash} from 'node:crypto';
import type pg from 'pg';
import type {z} from 'zod';
import {listingFilters,exactPriceMinor,listingSearchSchemaVersion} from '@haven/contracts';
import {data,env,transaction,fail,encrypt,decrypt} from '../platform/core.js';
import {rankingExpressions,rankingMetadata} from './ranking-policy.js';
type Filters=z.output<typeof listingFilters>;
const orders={recommended:rankingExpressions().score+' DESC,"publishedAt" DESC NULLS LAST',newest:'"publishedAt" DESC NULLS LAST',price_asc:'price::numeric ASC NULLS LAST',price_desc:'price::numeric DESC NULLS LAST',area_desc:'area::numeric DESC'};
const indexOrders={recommended:['publishedOrder:desc','id:asc'],newest:['publishedOrder:desc','id:asc'],price_asc:['priceMissing:asc','priceMinor:asc','id:asc'],price_desc:['priceMissing:asc','priceMinor:desc','id:asc'],area_desc:['areaNumber:desc','id:asc']};
export function compileListingSearch(q:Filters){
 const values:unknown[]=[],sql:string[]=[],search:string[]=[];
 const add=(column:string,operator:string,value:unknown,indexColumn=column,indexValue=value)=>{values.push(value);sql.push(`${column}${operator}$${values.length}`);search.push(`${indexColumn} ${operator} ${JSON.stringify(indexValue)}`);};
 add('city','=',q.city);add('currency','=',q.currency||'CNY');
 for(const key of ['transaction','segment','rentPeriod','rentalMode','propertyType','areaBasis','priceBasis'] as const)if(q[key]!==undefined)add('"'+key+'"','=',q[key],key);
 for(const key of ['beds','livingRooms'] as const)if(q[key]!==undefined){const list=String(q[key]).split(',').map(Number);values.push(list);sql.push(`"${key}"=ANY($${values.length}::int[])`);search.push('('+list.map(v=>`${key} = ${v}`).join(' OR ')+')');}
 for(const key of ['district','districtId','communityId','neighborhoodId','orientation','furnishing','floorCategory','buildingType','finishing','heating','fitOut'] as const)if(q[key]){const list=q[key]!.split(',');values.push(list);const column=['districtId','communityId','neighborhoodId'].includes(key)?`"${key}"::text`:`"${key}"`;sql.push(`${column}=ANY($${values.length}::text[])`);search.push('('+list.map(v=>`${key} = ${JSON.stringify(v)}`).join(' OR ')+')');}
 for(const key of ['features','ownership','holdingPeriod'] as const)if(q[key]){const list=q[key]!.split(',');values.push(list);sql.push(`"${key}" && $${values.length}::text[]`);search.push('('+list.map(v=>`${key} = ${JSON.stringify(v)}`).join(' OR ')+')');}
 for(const key of ['lineId','stationId'] as const)if(q[key]){values.push(q[key]!.split(','));sql.push(`"communityId" IN(SELECT co.id FROM communities co JOIN transit_stations s ON ST_DWithin(co.location,ST_SetSRID(ST_MakePoint(s.longitude::float8,s.latitude::float8),4326)::geography,1000) WHERE s.${key==='lineId'?'line_id':'id'}=ANY($${values.length}::uuid[]) AND s.status='active' AND s.city_id=(SELECT id FROM cities WHERE slug=$1))`);}
 if(q.permittedUse){const uses=q.permittedUse.split(',');values.push(uses);sql.push(`"permittedUses" && $${values.length}::text[]`);search.push('('+uses.map(v=>`permittedUses = ${JSON.stringify(v)}`).join(' OR ')+')');}
 if(q.availableBy){add('"availableFrom"::date','<=',q.availableBy,'availableOrder',Date.parse(q.availableBy+'T00:00:00Z'));search.push('availableKnown = true');}
 if(q.bounds){const [west,south,east,north]=q.bounds.split(',').map(Number);values.push(west,south,east,north);const start=values.length-3;sql.push(`longitude BETWEEN $${start} AND $${start+2} AND latitude BETWEEN $${start+1} AND $${start+3}`);}
 if(q.tourAvailable)add('"tourAvailable"','=',q.tourAvailable==='true','tourAvailable');
 const year=new Date().getUTCFullYear();
 if(q.minAge!==undefined)add('"builtYear"','<=',year-q.minAge,'builtYear');
 if(q.maxAge!==undefined)add('"builtYear"','>=',year-q.maxAge,'builtYear');
 if(q.recentDays!==undefined){const since=new Date(Date.now()-q.recentDays*86400000);add('"publishedAt"','>=',since.toISOString(),'publishedOrder',since.getTime());}
 if(q.elevator)add('elevator','=',q.elevator==='true');
 if(q.minPrice!==undefined)add('price::numeric','>=',q.minPrice,'priceMinor',exactPriceMinor(q.minPrice));
 if(q.maxPrice!==undefined)add('price::numeric','<=',q.maxPrice,'priceMinor',exactPriceMinor(q.maxPrice));
 const areaColumn=q.segment==='commercial'?(q.areaBasis==='gross'?'grossArea':'usableArea'):null,areaSql=areaColumn?'"'+areaColumn+'"::numeric':'area::numeric',areaIndex=areaColumn?areaColumn+'Number':'areaNumber';
 if(q.minArea!==undefined)add(areaSql,'>=',q.minArea,areaIndex);
 if(q.maxArea!==undefined)add(areaSql,'<=',q.maxArea,areaIndex);
 if(q.text){values.push('%'+q.text.replace(/[\\%_]/g,'\\$&')+'%');sql.push(`(title ILIKE $${values.length} OR community ILIKE $${values.length} OR district ILIKE $${values.length})`);}
 search.push(`projectionSchemaVersion = ${listingSearchSchemaVersion}`);
 // No raw expressions, column names or ordering are taken from callers.
 return {values,where:sql.join(' AND '),filter:search.join(' AND '),order:(q.sort==='area_desc'?areaSql+' DESC NULLS LAST':orders[q.sort])+',id ASC',indexOrder:q.sort==='area_desc'?[areaIndex+':desc','id:asc']:indexOrders[q.sort]};
}
function pageFor(q:Filters){
 const {page:_,cursor:__,...criteria}=q;
 const fingerprint=createHash('sha256').update(JSON.stringify(criteria)).digest('hex');
 let page=q.page;
 if(q.cursor){try{const token=decrypt<{page:number;fingerprint:string;expires:number}>(q.cursor);if(token.fingerprint!==fingerprint||token.expires<Date.now()||!Number.isInteger(token.page)||token.page<1||token.page>500)throw Error('INVALID_CURSOR');page=token.page;}catch{fail(400,'This search cursor is invalid or expired','INVALID_CURSOR');}}
 if((page-1)*q.limit>10000)fail(400,'Search page exceeds the bounded pagination limit','PAGE_LIMIT');
 return {page,fingerprint};
}
async function rentalPeriod(c:pg.PoolClient,q:Filters){if(q.segment==='commercial'||q.transaction!=='rent'||q.rentPeriod)return q;const row=(await c.query('SELECT data FROM market_config WHERE id=$1',[q.city])).rows[0],period=row?.data?.rentPeriod;if(!['day','month','year'].includes(period))fail(503,'Choose an explicit rental billing period; the market default is unavailable.','RENT_PERIOD_UNAVAILABLE');return {...q,rentPeriod:period} as Filters;}
export async function searchListings(q:Filters,searchUrl=env.SEARCH_URL){
 return transaction(null,async c=>{
  const market=(await c.query('SELECT currency FROM cities WHERE slug=$1',[q.city])).rows[0];
  const requestedPeriod=q.rentPeriod;q=await rentalPeriod(c,q);
  q={...q,currency:q.currency||market?.currency||'CNY'};
  const compiled=compileListingSearch(q),{page,fingerprint}=pageFor(q),offset=(page-1)*q.limit;
  const total=Number((await c.query(`SELECT count(*) FROM public_listings WHERE ${compiled.where}`,compiled.values)).rows[0].count);
  const ranking=q.sort==='recommended'?rankingExpressions():null;const rankingAsOf=ranking?(await c.query('SELECT now() AS instant')).rows[0].instant:undefined;
  const rows=(await c.query(`SELECT *${ranking?','+ranking.score+' AS "rankingScore",'+ranking.columns:','+rankingExpressions().disclosure} FROM public_listings WHERE ${compiled.where} ORDER BY ${compiled.order} LIMIT $${compiled.values.length+1} OFFSET $${compiled.values.length+2}`,[...compiled.values,q.limit,offset])).rows;
  let searchMode='sql',degradedReason:string|undefined;
  if(q.bounds||q.lineId||q.stationId)degradedReason='spatial-sql-contract';
  else if(q.text)degradedReason='literal-text-contract';
  else if(q.sort==='recommended'){/* Version-1 aggregate ranking is an intentional authoritative SQL plan. */}
  else try{
   const r=await fetch(searchUrl+'/indexes/listings/search',{method:'POST',headers:{Authorization:'Bearer '+env.SEARCH_KEY,'Content-Type':'application/json'},body:JSON.stringify({q:'',filter:compiled.filter,sort:compiled.indexOrder,offset,limit:q.limit,attributesToRetrieve:['id','sourceVersion','pricePrecisionSafe']}),signal:AbortSignal.timeout(1200)});
   if(!r.ok)throw Error('SEARCH_UNAVAILABLE');
   const result=await r.json() as {hits:{id:string;sourceVersion:number;pricePrecisionSafe:boolean}[];estimatedTotalHits:number};
   if(!Array.isArray(result.hits)||result.estimatedTotalHits!==total||result.hits.length!==rows.length||result.hits.some((hit,i)=>hit.id!==rows[i].id||hit.sourceVersion!==rows[i].version||!hit.pricePrecisionSafe))degradedReason='index-not-current';
   else searchMode='meilisearch';
  }catch{degradedReason='search-unavailable';}
  // Hydrate from current public SQL eligibility: queued withdrawal can never leak a document.
  const next=offset+rows.length<total&&page<500&&page*q.limit<=10000?encrypt({page:page+1,fingerprint,expires:Date.now()+3600000}):null;
  return data(rows,{total,page,limit:q.limit,...(q.transaction==='rent'?{rentalPeriod:q.rentPeriod||null,billingPeriodSource:requestedPeriod?'requested':q.segment==='commercial'?'unrestricted':'market'}:{}),searchMode,degraded:!!degradedReason,...(degradedReason?{degradedReason}:{}),pagination:'bounded-offset',maxOffset:10000,nextCursor:next,...(ranking?{ranking:rankingMetadata('30d',rankingAsOf),queryPlan:'ranking-v1'}:{})});
 });
}

export async function mapListings(q:Filters){
 return transaction(null,async c=>{
  const market=(await c.query('SELECT currency FROM cities WHERE slug=$1',[q.city])).rows[0];
  q=await rentalPeriod(c,q);const compiled=compileListingSearch({...q,currency:q.currency||market?.currency||'CNY'});
  const totals=(await c.query(`SELECT count(*)::int AS total,count(*) FILTER(WHERE latitude IS NOT NULL AND longitude IS NOT NULL)::int AS located FROM public_listings WHERE ${compiled.where}`,compiled.values)).rows[0];
  const rows=(await c.query(`SELECT id,slug,title,transaction,segment,price,currency,"rentPeriod","propertyType","grossArea","usableArea","areaBasis","priceBasis","fitOut","permittedUses",area,beds,"livingRooms",community,district,city,latitude,longitude,${rankingExpressions().disclosure} FROM public_listings WHERE ${compiled.where} AND latitude IS NOT NULL AND longitude IS NOT NULL ORDER BY ${compiled.order} LIMIT 500`,compiled.values)).rows;
  return data(rows,{...totals,limit:500,truncated:totals.located>500,coordinatePrecision:'community-rounded-3-decimals',searchMode:'sql'});
 });
}
