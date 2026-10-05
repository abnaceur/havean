-- Canonical property/room overlap: a property conflicts with every child;
-- a room conflicts with its own property and itself, but not sibling rooms.
CREATE FUNCTION lock_rental_scope(target uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE root uuid;
BEGIN
 SELECT coalesce(parent_unit_id,id) INTO root FROM units WHERE id=target;
 IF root IS NULL THEN RAISE EXCEPTION 'Rental unit not found' USING ERRCODE='23503'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('rental-scope:'||root::text,0));
 RETURN root;
END $$;
CREATE FUNCTION rental_unit_is_free(target uuid,ignored_listing uuid DEFAULT NULL) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM units WHERE id=target) AND NOT EXISTS(
 SELECT 1 FROM units subject JOIN units other ON other.id=subject.id OR other.id=subject.parent_unit_id OR other.parent_unit_id=subject.id
 WHERE subject.id=target AND (EXISTS(SELECT 1 FROM leases lease WHERE lease.unit_id=other.id AND lease.status='active')
 OR EXISTS(SELECT 1 FROM listings offer WHERE offer.unit_id=other.id AND offer.transaction='rent' AND offer.status='leased' AND offer.id IS DISTINCT FROM ignored_listing)))
$$;
CREATE FUNCTION rental_listing_available(target uuid) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce((SELECT l.status='published' AND (l.expires_at IS NULL OR l.expires_at>now()) AND (l.transaction<>'rent' OR rental_unit_is_free(l.unit_id,l.id)) FROM listings l WHERE l.id=target),false)
$$;
REVOKE ALL ON FUNCTION lock_rental_scope(uuid),rental_unit_is_free(uuid,uuid),rental_listing_available(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lock_rental_scope(uuid),rental_unit_is_free(uuid,uuid),rental_listing_available(uuid) TO haven_app;
CREATE OR REPLACE FUNCTION published_listing_destination(listing_uuid uuid)
RETURNS TABLE(organization_id uuid,agent_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE destination listings%ROWTYPE;
BEGIN
 SELECT * INTO destination FROM listings WHERE id=listing_uuid;
 IF NOT FOUND THEN RETURN; END IF;
 IF destination.transaction='rent' THEN PERFORM lock_rental_scope(destination.unit_id); END IF;
 RETURN QUERY SELECT l.organization_id,l.agent_id FROM listings l WHERE l.id=listing_uuid AND rental_listing_available(l.id) FOR SHARE OF l;
END $$;
-- Direct inserts receive the same lock/eligibility check as API preflight.
CREATE FUNCTION rental_contact_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target uuid;
BEGIN
 IF TG_TABLE_NAME='viewings' THEN target:=NEW.listing_id;
 ELSIF NEW.resource_type='listing' THEN target:=NEW.resource_id;
 ELSE RETURN NEW;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM published_listing_destination(target)) THEN RAISE EXCEPTION 'Property is no longer available' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER rental_viewing_destination BEFORE INSERT ON viewings FOR EACH ROW EXECUTE FUNCTION rental_contact_guard();
CREATE TRIGGER rental_inquiry_destination BEFORE INSERT ON leads FOR EACH ROW EXECUTE FUNCTION rental_contact_guard();
-- Occupancy changes refresh every affected offer; version is re-read by worker.
CREATE FUNCTION rental_availability_projection() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target uuid; before_state text; after_state text;
BEGIN
 target:=NEW.unit_id;before_state:=CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.status END;after_state:=NEW.status;
 IF TG_TABLE_NAME='listings' AND to_jsonb(NEW)->>'transaction'<>'rent' THEN RETURN NEW; END IF;
 IF before_state IS NOT DISTINCT FROM after_state THEN RETURN NEW; END IF;
 IF (TG_TABLE_NAME='listings' AND (before_state='leased' OR after_state='leased')) OR (TG_TABLE_NAME='leases' AND (before_state='active' OR after_state='active')) THEN
  PERFORM lock_rental_scope(target);
  INSERT INTO outbox(aggregate_id,kind,payload)
   SELECT l.id,'listing.availability_changed',jsonb_build_object('version',l.version) FROM listings l JOIN units other ON other.id=l.unit_id JOIN units subject ON subject.id=target
   WHERE l.transaction='rent' AND (other.id=subject.id OR other.id=subject.parent_unit_id OR other.parent_unit_id=subject.id);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER rental_listing_projection AFTER INSERT OR UPDATE OF status ON listings FOR EACH ROW EXECUTE FUNCTION rental_availability_projection();
CREATE TRIGGER rental_lease_projection AFTER INSERT OR UPDATE OF status ON leases FOR EACH ROW EXECUTE FUNCTION rental_availability_projection();

CREATE OR REPLACE VIEW public_listings WITH (security_invoker=true) AS SELECT eligible.* FROM (
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
) eligible WHERE rental_listing_available(eligible.id);
