import {Controller,Get,Query} from '@nestjs/common';
import {z} from 'zod';
import {rankingFilters,listingFilters} from '@haven/contracts';
import {transaction,data,fail} from '../platform/core.js';
import {compileListingSearch} from './search.js';
import {rankingExpressions,rankingMetadata} from './ranking-policy.js';
export async function rankedListings(q:z.output<typeof rankingFilters>,excludeId?:string){return transaction(null,async c=>{
 const asOf=(await c.query('SELECT now() AS instant')).rows[0].instant;
 const currency=(await c.query('SELECT currency FROM cities WHERE slug=$1',[q.city])).rows[0]?.currency;
 const compiled=compileListingSearch({...q,currency:q.currency||currency||'CNY'}),values=[...compiled.values];let where=compiled.where;
 if(excludeId){values.push(excludeId);where+=` AND id<>$${values.length}`;}
 const total=Number((await c.query(`SELECT count(*) FROM public_listings WHERE ${where}`,values)).rows[0].count);
 const expression=rankingExpressions(q.period),offset=(q.page-1)*q.limit;if(offset>10000)fail(400,'Ranking page exceeds the bounded limit','PAGE_LIMIT');if(q.cursor)fail(400,'Rankings use bounded pages','INVALID_CURSOR');
 const rows=(await c.query(`SELECT *,${expression.score} AS "rankingScore",${expression.columns} FROM public_listings WHERE ${where} ORDER BY "rankingScore" DESC,"publishedAt" DESC NULLS LAST,id LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,q.limit,offset])).rows;
 return data(rows,{total,page:q.page,limit:q.limit,pagination:'bounded-offset',maxOffset:10000,...rankingMetadata(q.period,asOf)});
});}
@Controller('api/v1')
export class RankingsController{
 @Get('rankings') rankings(@Query() input:unknown){return rankedListings(rankingFilters.parse(input));}
 @Get('recommendations/listings') recommendations(@Query() input:unknown){const q=listingFilters.parse(input);return rankedListings(rankingFilters.parse({...q,sort:'recommended',period:'30d'}));}
 @Get('recommendations/developments') async developments(@Query() input:unknown){const q=z.strictObject({city:z.string().regex(/^[a-z0-9-]{1,50}$/).default('bj'),limit:z.coerce.number().int().min(1).max(20).default(6)}).parse(input);return transaction(null,async c=>{
  const rows=(await c.query(`SELECT de.id,de.slug,de.name,de.description,de.status,de.price_min,de.price_max,de.currency,de.price_basis,de.completion_date,de.photos,de.features,de.inventory_at,co.name AS community,d.name AS district,
  (GREATEST(0,30-GREATEST(0,(now() AT TIME ZONE 'UTC')::date-(de.inventory_at AT TIME ZONE 'UTC')::date))+COALESCE((public_curated_boost('development',de.id)->>'points')::int,0)) AS "rankingScore",COALESCE((public_curated_boost('development',de.id)->>'sponsored')::boolean,false) AS sponsored,public_curated_boost('development',de.id)->>'label' AS "curationLabel"
  FROM developments de JOIN communities co ON co.id=de.community_id JOIN districts d ON d.id=co.district_id JOIN cities ci ON ci.id=d.city_id WHERE ci.slug=$1 AND de.status IN('on_sale','coming_soon') ORDER BY "rankingScore" DESC,de.inventory_at DESC,de.id LIMIT $2`,[q.city,q.limit])).rows;
  return data(rows,{ruleVersion:1,asOf:new Date().toISOString(),definition:'Eligible city developments, inventory freshness and active curated boost. Sponsored boosts are labeled.'});
 });}
}
