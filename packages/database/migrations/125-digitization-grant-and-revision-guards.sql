-- Additive hardening after the initial ledger; no applied migration is rewritten.
ALTER TABLE digitization_evidence_grants ADD CONSTRAINT evidence_grant_input_scope FOREIGN KEY(digitization_id,input_revision) REFERENCES property_input_revisions(digitization_id,revision);
CREATE FUNCTION digitization_grant_authority_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE parent property_digitizations;
BEGIN
 IF TG_OP='INSERT' THEN
  SELECT * INTO parent FROM property_digitizations WHERE id=NEW.digitization_id;
  IF parent.state<>'active' OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=actor_id() AND state='active') OR
   (parent.target_type='listing' AND NOT EXISTS(SELECT 1 FROM listings l JOIN owner_unit_grants g ON g.unit_id=l.unit_id AND g.owner_id=l.owner_id WHERE l.id=parent.target_id AND l.owner_id=NEW.owner_id AND g.status='active' AND (g.expires_at IS NULL OR g.expires_at>statement_timestamp()))) THEN
   RAISE EXCEPTION 'Current owner evidence authority required' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER digitization_grant_authority BEFORE INSERT OR UPDATE ON digitization_evidence_grants FOR EACH ROW EXECUTE FUNCTION digitization_grant_authority_guard();
CREATE FUNCTION digitization_current_revision_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.current_input_revision>0 AND NOT EXISTS(SELECT 1 FROM property_input_revisions r WHERE r.digitization_id=NEW.id AND r.revision=NEW.current_input_revision) THEN
  RAISE EXCEPTION 'Current input revision must exist in this engine scope' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER digitization_current_revision BEFORE INSERT OR UPDATE ON property_digitizations FOR EACH ROW EXECUTE FUNCTION digitization_current_revision_guard();
