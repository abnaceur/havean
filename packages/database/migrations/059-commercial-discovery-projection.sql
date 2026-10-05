CREATE OR REPLACE VIEW public_listings WITH (security_invoker=true) AS SELECT eligible.*, c.property_type AS "propertyType",c.gross_area::text AS "grossArea",c.usable_area::text AS "usableArea",c.area_basis AS "areaBasis",CASE WHEN eligible.transaction='sale' THEN c.sale_basis ELSE c.rent_basis END AS "priceBasis",c.fit_out AS "fitOut",c.parking_spaces AS "parkingSpaces",COALESCE(c.permitted_uses,'{}'::text[]) AS "permittedUses" FROM (
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
) base LEFT JOIN rental_terms t ON t.listing_id=base.id
) eligible LEFT JOIN commercial_details c ON c.listing_id=eligible.id AND eligible.segment='commercial' WHERE rental_listing_available(eligible.id);
