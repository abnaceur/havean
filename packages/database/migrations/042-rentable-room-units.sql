ALTER TABLE units ADD COLUMN parent_unit_id uuid REFERENCES units,
 ADD COLUMN unit_kind text NOT NULL DEFAULT 'property' CHECK(unit_kind IN('property','room')),
 ADD COLUMN room_label text,ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0),
 ADD CONSTRAINT explicit_room_parent CHECK((unit_kind='property' AND parent_unit_id IS NULL AND room_label IS NULL) OR (unit_kind='room' AND parent_unit_id IS NOT NULL AND length(trim(room_label)) BETWEEN 1 AND 80));
CREATE FUNCTION validate_room_parent() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.unit_kind='room' AND NOT EXISTS(SELECT 1 FROM units p WHERE p.id=NEW.parent_unit_id AND p.unit_kind='property' AND p.community_id=NEW.community_id AND p.organization_id=NEW.organization_id AND NEW.area<=p.area AND p.id<>NEW.id) THEN
  RAISE EXCEPTION 'A room requires a property parent in the same community and organization, with sufficient area' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM units child WHERE child.parent_unit_id=NEW.id AND (NEW.unit_kind<>'property' OR child.community_id<>NEW.community_id OR child.organization_id<>NEW.organization_id OR child.area>NEW.area)) THEN
  RAISE EXCEPTION 'Property changes conflict with a rentable child room' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER room_parent BEFORE INSERT OR UPDATE ON units FOR EACH ROW EXECUTE FUNCTION validate_room_parent();
CREATE FUNCTION validate_rental_scope() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target uuid; row record;
BEGIN
 target:=CASE WHEN TG_TABLE_NAME='listings' THEN NEW.id ELSE NEW.listing_id END;
 SELECT l.transaction,l.segment,l.currency,l.rent_period,u.unit_kind,t.rental_mode,t.billing_period,t.currency terms_currency INTO row FROM listings l JOIN units u ON u.id=l.unit_id LEFT JOIN rental_terms t ON t.listing_id=l.id WHERE l.id=target;
 IF row.unit_kind='room' AND (row.transaction<>'rent' OR row.segment<>'residential' OR row.rental_mode IS DISTINCT FROM 'shared') THEN RAISE EXCEPTION 'Room listings require shared residential rental terms' USING ERRCODE='23514'; END IF;
 IF row.rental_mode='shared' AND row.unit_kind<>'room' THEN RAISE EXCEPTION 'Shared rentals require an explicit child room' USING ERRCODE='23514'; END IF;
 IF row.billing_period IS NOT NULL AND row.billing_period IS DISTINCT FROM row.rent_period THEN RAISE EXCEPTION 'Billing period differs from listing rent period' USING ERRCODE='23514'; END IF;
 IF row.terms_currency IS NOT NULL AND row.terms_currency<>row.currency THEN RAISE EXCEPTION 'Deposit currency differs from listing currency' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER rental_listing_scope AFTER INSERT OR UPDATE ON listings DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_rental_scope();
CREATE CONSTRAINT TRIGGER rental_terms_scope AFTER INSERT OR UPDATE ON rental_terms DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_rental_scope();
