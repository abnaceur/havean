ALTER TABLE buildings ADD COLUMN building_type text CHECK(building_type IN('Tower','Slab','Combined','Bungalow'));
-- This read port avoids recursion through public-media RLS and returns only public eligibility.
CREATE FUNCTION published_listing_has_tour(listing_uuid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM listings l JOIN listing_media m ON m.listing_id=l.id JOIN media_assets a ON a.id=m.asset_id
 WHERE l.id=listing_uuid AND l.status='published' AND (l.expires_at IS NULL OR l.expires_at>now())
 AND m.kind='panorama' AND m.status='approved' AND a.status='approved' AND a.visibility='public' AND a.scan_at IS NOT NULL)
$$;
CREATE OR REPLACE VIEW public_listings WITH (security_invoker=true) AS
SELECT l.id,l.slug,l.title,l.description,l.transaction,l.segment,l.price::text,l.currency,l.rent_period AS "rentPeriod",l.features,l.photos,l.furnishing,l.available_from AS "availableFrom",l.version,l.status,l.published_at AS "publishedAt",u.area::text,u.beds,u.living_rooms AS "livingRooms",u.baths,u.orientation,u.elevator,co.id AS "communityId",co.name AS community,d.name AS district,d.id AS "districtId",ci.slug AS city,l.agent_id AS "agentId",round(ST_Y(co.location::geometry)::numeric,3)::float8 AS latitude,round(ST_X(co.location::geometry)::numeric,3)::float8 AS longitude,
co.neighborhood_id AS "neighborhoodId",COALESCE(b.completed_year,co.built_year) AS "builtYear",
CASE WHEN u.floor<=0 THEN 'Basement' WHEN b.floors IS NULL THEN NULL WHEN u.floor<=ceil(b.floors/3.0) THEN 'Low' WHEN u.floor<=ceil(b.floors*2/3.0) THEN 'Middle' ELSE 'High' END AS "floorCategory",
b.building_type AS "buildingType",r.finishing,r.heating,COALESCE(r.ownership_attributes,'{}') AS ownership,COALESCE(r.holding_period_attributes,'{}') AS "holdingPeriod",published_listing_has_tour(l.id) AS "tourAvailable"
FROM listings l JOIN units u ON u.id=l.unit_id JOIN communities co ON co.id=u.community_id JOIN districts d ON d.id=co.district_id JOIN cities ci ON ci.id=d.city_id
LEFT JOIN buildings b ON b.id=u.building_id LEFT JOIN residential_details r ON r.listing_id=l.id
WHERE l.status='published' AND (l.expires_at IS NULL OR l.expires_at>now());
UPDATE market_config SET data=data||jsonb_build_object('pricePresets',CASE WHEN id='bj' THEN '[{"label":"Up to 4 million","transaction":"sale","min":"0","max":"4000000"},{"label":"4–6 million","transaction":"sale","min":"4000000","max":"6000000"},{"label":"Above 6 million","transaction":"sale","min":"6000000"},{"label":"Up to 5,000/month","transaction":"rent","min":"0","max":"5000"}]'::jsonb ELSE '[]'::jsonb END),version=version+1 WHERE NOT data ? 'pricePresets';
