ALTER TABLE listing_revisions ADD COLUMN proposed_price numeric(18,2) CHECK(proposed_price>0);
UPDATE listing_revisions SET proposed_price=(changes->>'price')::numeric WHERE coalesce(changes->>'price','')~'^[0-9]+(\.[0-9]{1,2})?$' AND length(changes->>'price')<=16 AND (changes->>'price')::numeric>0;
CREATE FUNCTION canonical_proposed_price_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.proposed_price IS NOT NULL AND NEW.proposed_price IS DISTINCT FROM OLD.proposed_price THEN RAISE EXCEPTION 'The recorded proposed amount is immutable' USING ERRCODE='23514'; END IF;
 IF NEW.proposed_price IS NOT NULL THEN
  IF coalesce(NEW.changes->>'price','')!~'^[0-9]+(\.[0-9]{1,2})?$' OR length(NEW.changes->>'price')>16 THEN RAISE EXCEPTION 'Proposed amount must match its decimal declaration' USING ERRCODE='23514'; END IF;
  IF (NEW.changes->>'price')::numeric<>NEW.proposed_price THEN RAISE EXCEPTION 'Proposed amount must match its decimal declaration' USING ERRCODE='23514'; END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER canonical_proposed_price_guard BEFORE INSERT OR UPDATE ON listing_revisions FOR EACH ROW EXECUTE FUNCTION canonical_proposed_price_guard();
CREATE OR REPLACE FUNCTION owner_price_revision_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE source listings%ROWTYPE;
BEGIN
 SELECT * INTO source FROM listings WHERE id=NEW.listing_id;
 IF NOT staff_scope() AND NOT review_scope() AND source.owner_id=actor_id() THEN
  IF NEW.proposed_price IS NULL OR TG_OP='UPDATE' OR NEW.actor_id<>actor_id() OR source.status<>'published' OR NEW.status<>'pending' OR NEW.base_version<>source.version OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.review_reason IS NOT NULL OR NEW.changes->>'title' IS DISTINCT FROM source.title OR (NEW.changes-'title'-'price'-'version'-'reason')<>'{}'::jsonb OR coalesce(NEW.changes->>'price','')!~'^[0-9]+(\.[0-9]{1,2})?$' OR length(NEW.changes->>'price')>16 THEN RAISE EXCEPTION 'Owner price changes require current published facts and independent review' USING ERRCODE='42501'; END IF;
  IF (NEW.changes->>'price')::numeric<=0 OR length(coalesce(NEW.changes->>'reason',''))<5 OR NOT EXISTS(SELECT 1 FROM current_owner_unit_grant(source.unit_id)) THEN RAISE EXCEPTION 'Owner price change requires current authority and a positive amount/reason' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $$;
