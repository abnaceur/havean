CREATE INDEX listings_due_expiration ON listings(expires_at,id) WHERE status='published' AND expires_at IS NOT NULL;
CREATE OR REPLACE VIEW public_listings WITH (security_invoker=true) AS SELECT l.id,l.slug,l.title,l.description,l.transaction,l.segment,l.price::text,l.currency,l.rent_period AS "rentPeriod",l.features,l.photos,l.furnishing,l.available_from AS "availableFrom",l.version,l.status,l.published_at AS "publishedAt",u.area::text,u.beds,u.living_rooms AS "livingRooms",u.baths,u.orientation,u.elevator,co.id AS "communityId",co.name AS community,d.name AS district,d.id AS "districtId",ci.slug AS city,l.agent_id AS "agentId",round(ST_Y(co.location::geometry)::numeric,3)::float8 AS latitude,round(ST_X(co.location::geometry)::numeric,3)::float8 AS longitude FROM listings l JOIN units u ON u.id=l.unit_id JOIN communities co ON co.id=u.community_id JOIN districts d ON d.id=co.district_id JOIN cities ci ON ci.id=d.city_id WHERE l.status='published' AND (l.expires_at IS NULL OR l.expires_at>now());
CREATE OR REPLACE FUNCTION published_listing_destination(listing_uuid uuid)
RETURNS TABLE(organization_id uuid,agent_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT l.organization_id,l.agent_id FROM listings l WHERE l.id=listing_uuid AND l.status='published' AND (l.expires_at IS NULL OR l.expires_at>now()) FOR SHARE
$$;
-- Inventory-owned transition used only by the authenticated expiration worker.
CREATE FUNCTION expire_scheduled_listing(listing_uuid uuid,expected_deadline timestamptz,at_time timestamptz DEFAULT now()) RETURNS jsonb
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE previous listings%ROWTYPE; result jsonb;
BEGIN
 IF NOT staff_scope() THEN RAISE EXCEPTION 'Expiration worker authority required' USING ERRCODE='42501'; END IF;
 SELECT * INTO previous FROM listings WHERE id=listing_uuid FOR UPDATE;
 IF NOT FOUND OR previous.status<>'published' OR previous.expires_at IS NULL OR previous.expires_at IS DISTINCT FROM expected_deadline OR at_time IS NULL OR previous.expires_at>at_time THEN RETURN NULL; END IF;
 UPDATE listings SET status='expired',version=version+1,updated_at=at_time WHERE id=listing_uuid
 RETURNING jsonb_build_object('id',id,'status',status,'version',version) INTO result;
 INSERT INTO listing_status_history(listing_id,previous_status,next_status,actor_id,reason,listing_version,created_at)
 VALUES(listing_uuid,'published','expired',public.actor_id(),'Scheduled publication deadline elapsed',previous.version+1,at_time);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION expire_scheduled_listing(uuid,timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION expire_scheduled_listing(uuid,timestamptz,timestamptz) TO haven_app;
