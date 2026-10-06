import type pg from 'pg';
const reserved="('account','tenant','ops','api','sitemap','sitemaps','robots')";
const categories=['buy','rent','commercial','new-homes','communities','agents','renovation','tools/mortgage','support'];
const source=`WITH active_cities AS (SELECT * FROM cities WHERE status='active' AND slug NOT IN ${reserved}),routes AS (
 SELECT '/'||slug AS path,NULL::timestamptz AS modified FROM active_cities
 UNION ALL SELECT '/'||ci.slug||'/'||category,NULL::timestamptz FROM active_cities ci CROSS JOIN unnest(ARRAY[${categories.map(c=>"'"+c+"'").join(',')}]) category
 UNION ALL SELECT '/'||p.city||'/'||CASE WHEN p.segment='commercial' THEN 'commercial' WHEN p.transaction='rent' THEN 'rent' ELSE 'buy' END||'/'||p.slug,p."publishedAt"::timestamptz FROM public_listings p JOIN active_cities ci ON ci.slug=p.city
 UNION ALL SELECT '/'||ci.slug||'/new-homes/'||de.slug,de.inventory_at FROM developments de JOIN communities co ON co.id=de.community_id AND co.status='active' JOIN districts d ON d.id=co.district_id AND d.status='active' JOIN active_cities ci ON ci.id=d.city_id WHERE de.status IN('coming_soon','on_sale','sold_out')
 UNION ALL SELECT '/'||ci.slug||'/communities/'||co.slug,NULL::timestamptz FROM communities co JOIN districts d ON d.id=co.district_id AND d.status='active' JOIN active_cities ci ON ci.id=d.city_id WHERE co.status='active'
 UNION ALL SELECT '/'||ci.slug||'/agents/'||a.slug,NULL::timestamptz FROM agents a JOIN active_cities ci ON (a.city IS NULL OR a.city=ci.slug) WHERE EXISTS(SELECT 1 FROM districts d WHERE d.city_id=ci.id AND d.status='active' AND d.name=ANY(a.districts))
 UNION ALL SELECT '/'||p.city||'/renovation/'||p.slug,NULL::timestamptz FROM public_providers p JOIN active_cities ci ON ci.slug=p.city
) SELECT DISTINCT path,modified FROM routes`;
/** Public current eligibility only. Null timestamps are retained rather than invented. */
export async function sitemapRead(c:pg.PoolClient,page:number){const total=Number((await c.query('SELECT count(*) count FROM('+source+') eligible')).rows[0].count);const rows=(await c.query('SELECT path,modified FROM('+source+') eligible ORDER BY path LIMIT 10000 OFFSET $1',[page*10000])).rows;return {page,pages:Math.max(1,Math.ceil(total/10000)),entries:rows.map(r=>({path:r.path,lastModified:r.modified?new Date(r.modified).toISOString():null}))};}
