export const rankingVersion=1;
export function rankingExpressions(period:'7d'|'30d'='30d'){
 const days=period==='7d'?7:30;
 const views=`public_listing_view_count(id,(now() AT TIME ZONE 'UTC')::date-${days-1})`;
 const boost="public_curated_boost('listing',id)";
 const freshness=`CASE WHEN "publishedAt" IS NULL THEN 0 ELSE GREATEST(0,30-GREATEST(0,(now() AT TIME ZONE 'UTC')::date-("publishedAt" AT TIME ZONE 'UTC')::date)) END`;
 const disclosure=`COALESCE((${boost}->>'sponsored')::boolean,false) AS "sponsored",${boost}->>'label' AS "curationLabel"`;
 return {disclosure,score:`(${freshness}+2*LEAST(1000,${views})+COALESCE((${boost}->>'points')::int,0))`,columns:`${views} AS "viewCount",COALESCE((${boost}->>'sponsored')::boolean,false) AS sponsored,${boost}->>'label' AS "curationLabel"`};
}
export function rankingMetadata(period:'7d'|'30d',asOf=new Date()){
 const end=new Date(Date.UTC(asOf.getUTCFullYear(),asOf.getUTCMonth(),asOf.getUTCDate()+1)),start=new Date(end.getTime()-(period==='7d'?7:30)*86400000);
 return {ruleVersion:rankingVersion,period,periodStart:start.toISOString(),periodEnd:end.toISOString(),asOf:asOf.toISOString(),definition:'Publication freshness + 2 × capped unique consented account/day views + active curated boost. Sponsored boosts are labeled.'};
}
