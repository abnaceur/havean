-- Canonical units can carry multiple explicit agency mandates without copying private addresses.
CREATE TABLE listing_mandates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), unit_id uuid NOT NULL REFERENCES units,
 organization_id uuid NOT NULL REFERENCES organizations, owner_id uuid NOT NULL REFERENCES profiles,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
 starts_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 version int NOT NULL DEFAULT 1 CHECK(version>0), CHECK(expires_at>starts_at),
 UNIQUE(unit_id,organization_id)
);
ALTER TABLE listing_mandates ENABLE ROW LEVEL SECURITY;
CREATE POLICY mandate_scope ON listing_mandates USING(organization_id=org_id() OR owner_id=actor_id() OR staff_scope()) WITH CHECK(owner_id=actor_id() OR staff_scope());
CREATE FUNCTION listing_unit_parent() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM units u WHERE u.id=NEW.unit_id AND (u.organization_id=NEW.organization_id OR EXISTS(SELECT 1 FROM listing_mandates m WHERE m.unit_id=u.id AND m.organization_id=NEW.organization_id AND m.status='active' AND m.starts_at<=now() AND m.expires_at>now()))) THEN
  RAISE EXCEPTION 'Listing requires a unit in its organization or an active mandate' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER listing_unit_parent BEFORE INSERT OR UPDATE OF unit_id,organization_id ON listings FOR EACH ROW EXECUTE FUNCTION listing_unit_parent();
CREATE TABLE residential_details (
 listing_id uuid PRIMARY KEY REFERENCES listings ON DELETE CASCADE,
 finishing text, heating text, ownership_attributes text[] NOT NULL DEFAULT '{}', holding_period_attributes text[] NOT NULL DEFAULT '{}',
 occupancy text CHECK(occupancy IN ('vacant','occupied','unknown')), version int NOT NULL DEFAULT 1 CHECK(version>0)
);
CREATE TABLE commercial_details (
 listing_id uuid PRIMARY KEY REFERENCES listings ON DELETE CASCADE,
 property_type text CHECK(property_type IN ('office','retail','warehouse')),
 gross_area numeric(12,2) CHECK(gross_area>0), usable_area numeric(12,2) CHECK(usable_area>0),
 fit_out text, floor int, parking_spaces int CHECK(parking_spaces>=0), permitted_uses text[] NOT NULL DEFAULT '{}',
 rent_basis text CHECK(rent_basis IN ('total','per_area')), version int NOT NULL DEFAULT 1 CHECK(version>0),
 CHECK(usable_area IS NULL OR gross_area IS NULL OR usable_area<=gross_area)
);
CREATE TABLE rental_terms (
 listing_id uuid PRIMARY KEY REFERENCES listings ON DELETE CASCADE,
 rental_mode text CHECK(rental_mode IN ('entire','shared')), minimum_months int CHECK(minimum_months>0),
 deposit_amount numeric(18,2) CHECK(deposit_amount>=0), currency char(3), billing_period text CHECK(billing_period IN ('day','month','year')),
 utilities text[] NOT NULL DEFAULT '{}', move_in_date date, room_attributes text[] NOT NULL DEFAULT '{}',
 version int NOT NULL DEFAULT 1 CHECK(version>0)
);
CREATE FUNCTION listing_details_parent() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent listings;
BEGIN
 SELECT * INTO parent FROM listings WHERE id=NEW.listing_id;
 IF parent.id IS NULL OR (TG_TABLE_NAME='residential_details' AND parent.segment<>'residential') OR (TG_TABLE_NAME='commercial_details' AND parent.segment<>'commercial') OR (TG_TABLE_NAME='rental_terms' AND parent.transaction<>'rent') THEN
  RAISE EXCEPTION 'Listing details do not match their parent' USING ERRCODE='23514';
 END IF;
 IF TG_TABLE_NAME='rental_terms' THEN
  IF NEW.currency IS NOT NULL AND NEW.currency<>parent.currency THEN RAISE EXCEPTION 'Rental currency differs from listing' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['residential_details','commercial_details','rental_terms'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY details_read ON %I FOR SELECT USING(listing_id IN(SELECT id FROM listings WHERE status=''published'' OR organization_id=org_id() OR owner_id=actor_id() OR staff_scope() OR review_scope()))',t);
 EXECUTE format('CREATE POLICY details_write ON %I FOR ALL USING(listing_id IN(SELECT id FROM listings WHERE organization_id=org_id() OR owner_id=actor_id() OR staff_scope())) WITH CHECK(listing_id IN(SELECT id FROM listings WHERE organization_id=org_id() OR owner_id=actor_id() OR staff_scope()))',t);
 EXECUTE format('CREATE TRIGGER details_parent BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION listing_details_parent()',t);
END LOOP; END $$;
CREATE INDEX listings_public_price ON listings(status,transaction,segment,price,id);
CREATE INDEX listings_public_published ON listings(status,published_at DESC,id);
CREATE INDEX listings_unit ON listings(unit_id);
CREATE INDEX units_community ON units(community_id);
