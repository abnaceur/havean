-- Public availability is already disclosed by listing eligibility. Return only
-- canonical unit identifiers; never return tenant, lease or private offer data.
-- An occupied room blocks itself and its property, not sibling rooms. An
-- occupied property blocks itself and every child. Mutating rental workflows
-- retain their original advisory locks and current per-resource checks.
CREATE FUNCTION public_unavailable_rental_units() RETURNS TABLE(unit_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH occupied AS MATERIALIZED (
  SELECT unit_id FROM leases WHERE status='active'
  UNION SELECT unit_id FROM listings WHERE transaction='rent' AND status='leased'
 )
 SELECT unit_id FROM occupied
 UNION SELECT subject.parent_unit_id FROM occupied JOIN units subject ON subject.id=occupied.unit_id WHERE subject.parent_unit_id IS NOT NULL
 UNION SELECT child.id FROM occupied JOIN units child ON child.parent_unit_id=occupied.unit_id
$$;
REVOKE ALL ON FUNCTION public_unavailable_rental_units() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_unavailable_rental_units() TO haven_app;
CREATE INDEX leased_rental_unit_eligibility ON listings(unit_id) WHERE transaction='rent' AND status='leased';
CREATE INDEX active_lease_unit_eligibility ON leases(unit_id) WHERE status='active';
CREATE OR REPLACE VIEW public_listings WITH (security_invoker=true) AS SELECT eligible.*, c.property_type AS "propertyType",c.gross_area::text AS "grossArea",c.usable_area::text AS "usableArea",c.area_basis AS "areaBasis",CASE WHEN eligible.transaction='sale' THEN c.sale_basis ELSE c.rent_basis END AS "priceBasis",c.fit_out AS "fitOut",c.parking_spaces AS "parkingSpaces",COALESCE(c.permitted_uses,'{}'::text[]) AS "permittedUses",c.floor AS "commercialFloor" FROM (
SELECT base.*,t.rental_mode AS "rentalMode" FROM (
SELECT l.id,
    l.slug,
    l.title,
    l.description,
    l.transaction,
    l.segment,
    l.price::text AS price,
    l.currency,
    l.rent_period AS "rentPeriod",
    l.features,
    l.photos,
    l.furnishing,
    l.available_from AS "availableFrom",
    l.version,
    l.status,
    l.published_at AS "publishedAt",
    u.area::text AS area,
    u.beds,
    u.living_rooms AS "livingRooms",
    u.baths,
    u.orientation,
    u.elevator,
    co.id AS "communityId",
    co.name AS community,
    d.name AS district,
    d.id AS "districtId",
    ci.slug AS city,
    l.agent_id AS "agentId",
    round(st_y(co.location::geometry)::numeric, 3)::double precision AS latitude,
    round(st_x(co.location::geometry)::numeric, 3)::double precision AS longitude,
    co.neighborhood_id AS "neighborhoodId",
    COALESCE(b.completed_year, co.built_year) AS "builtYear",
        CASE
            WHEN u.floor <= 0 THEN 'Basement'::text
            WHEN b.floors IS NULL THEN NULL::text
            WHEN u.floor::numeric <= ceil(b.floors::numeric / 3.0) THEN 'Low'::text
            WHEN u.floor::numeric <= ceil((b.floors * 2)::numeric / 3.0) THEN 'Middle'::text
            ELSE 'High'::text
        END AS "floorCategory",
    b.building_type AS "buildingType",
    r.finishing,
    r.heating,
    COALESCE(r.ownership_attributes, '{}'::text[]) AS ownership,
    COALESCE(r.holding_period_attributes, '{}'::text[]) AS "holdingPeriod",
    published_listing_has_tour(l.id) AS "tourAvailable"
   FROM listings l
     JOIN units u ON u.id = l.unit_id
     JOIN communities co ON co.id = u.community_id
     JOIN districts d ON d.id = co.district_id
     JOIN cities ci ON ci.id = d.city_id
     LEFT JOIN buildings b ON b.id = u.building_id
     LEFT JOIN residential_details r ON r.listing_id = l.id
  WHERE l.status = 'published'::text AND (l.expires_at IS NULL OR l.expires_at > now())
    AND (l.transaction<>'rent' OR NOT EXISTS(SELECT 1 FROM public_unavailable_rental_units() blocked WHERE blocked.unit_id=l.unit_id))
) base LEFT JOIN rental_terms t ON t.listing_id=base.id
) eligible LEFT JOIN commercial_details c ON c.listing_id=eligible.id AND eligible.segment='commercial';
