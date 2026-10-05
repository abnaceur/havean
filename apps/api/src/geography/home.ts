import {Controller,Get,Query} from '@nestjs/common';
import {z} from 'zod';
import {data,fail,transaction} from '../platform/core.js';
import {rankingExpressions,rankingMetadata} from './ranking-policy.js';
@Controller('api/v1')
export class HomeDiscoveryController{
 @Get('discovery/home') async home(@Query() input:unknown){const q=z.strictObject({city:z.string().regex(/^[a-z0-9-]{1,50}$/).default('bj')}).parse(input);return transaction(null,async c=>{
  const city=(await c.query('SELECT currency FROM cities WHERE slug=$1',[q.city])).rows[0];if(!city)fail(404,'City not found','NOT_FOUND');
  const asOf=(await c.query('SELECT now() AS instant')).rows[0].instant,expression=rankingExpressions('30d');
  async function listings(transaction:string,curated:boolean,limit:number){return(await c.query(`SELECT *,${expression.score} AS "rankingScore",${expression.columns} FROM public_listings WHERE city=$1 AND currency=$2 AND transaction=$3 AND segment='residential' AND (NOT $4::boolean OR public_curated_boost('listing',id) IS NOT NULL) ORDER BY "rankingScore" DESC,"publishedAt" DESC NULLS LAST,id LIMIT $5`,[q.city,city.currency,transaction,curated,limit])).rows;}
  async function developments(curated:boolean){return(await c.query(`SELECT de.id,de.slug,de.name,de.description,de.status,de.price_min,de.price_max,de.currency,de.price_basis,de.completion_date,de.photos,de.features,de.inventory_at,co.name AS community,d.name AS district,ci.slug AS city,
   (CASE WHEN de.inventory_at IS NULL THEN 0 ELSE GREATEST(0,30-GREATEST(0,(now() AT TIME ZONE 'UTC')::date-(de.inventory_at AT TIME ZONE 'UTC')::date)) END+COALESCE((public_curated_boost('development',de.id)->>'points')::int,0)) AS "rankingScore",COALESCE((public_curated_boost('development',de.id)->>'sponsored')::boolean,false) AS sponsored,public_curated_boost('development',de.id)->>'label' AS "curationLabel"
   FROM developments de JOIN communities co ON co.id=de.community_id JOIN districts d ON d.id=co.district_id JOIN cities ci ON ci.id=d.city_id WHERE ci.slug=$1 AND de.currency=$2 AND de.status IN('on_sale','coming_soon') AND (NOT $3::boolean OR public_curated_boost('development',de.id) IS NOT NULL) ORDER BY "rankingScore" DESC,de.inventory_at DESC NULLS LAST,de.id LIMIT 3`,[q.city,city.currency,curated])).rows;}
  const resale=await listings('sale',false,6),rentals=await listings('rent',false,3),projects=await developments(false),curatedResale=await listings('sale',true,3),curatedDevelopments=await developments(true);
  return data({resale,rentals,developments:projects,curatedResale,curatedDevelopments},{city:q.city,...rankingMetadata('30d',asOf),curation:'Active eligible placements only; empty curated sections omitted.'});
 });}
}
