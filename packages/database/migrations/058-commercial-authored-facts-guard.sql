ALTER TABLE commercial_details ADD COLUMN legacy_incomplete boolean NOT NULL DEFAULT false;
UPDATE commercial_details SET legacy_incomplete=true WHERE area_basis IS NULL OR property_type IS NULL OR gross_area IS NULL OR usable_area IS NULL OR fit_out IS NULL OR length(trim(fit_out))=0 OR cardinality(permitted_uses)=0;
CREATE FUNCTION commercial_authored_facts_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE parent listings%ROWTYPE;
BEGIN
 SELECT * INTO parent FROM listings WHERE id=NEW.listing_id;
 IF NEW.legacy_incomplete AND (TG_OP='INSERT' OR NOT OLD.legacy_incomplete) AND NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='commercial_details'::regclass AND pg_has_role(session_user,relowner,'USAGE')) THEN RAISE EXCEPTION 'Unknown legacy facts can only be imported by database bootstrap' USING ERRCODE='42501'; END IF;
 IF NOT NEW.legacy_incomplete AND (NEW.property_type IS NULL OR NEW.gross_area IS NULL OR NEW.usable_area IS NULL OR NEW.area_basis IS NULL OR NEW.fit_out IS NULL OR length(trim(NEW.fit_out))=0 OR cardinality(NEW.permitted_uses)=0 OR (parent.transaction='sale' AND (NEW.sale_basis IS NULL OR parent.rent_period IS NOT NULL)) OR (parent.transaction='rent' AND NEW.rent_basis IS NULL)) THEN RAISE EXCEPTION 'Commercial offers require use, area definitions and a transaction-specific price basis' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER commercial_authored_facts_guard BEFORE INSERT OR UPDATE ON commercial_details FOR EACH ROW EXECUTE FUNCTION commercial_authored_facts_guard();
