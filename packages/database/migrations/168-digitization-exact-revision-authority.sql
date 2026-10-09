-- Reserve an immutable revision identity before owner grants, without creating
-- or changing a source snapshot. Grants never carry over to another revision.
CREATE TABLE digitization_input_slots(
 digitization_id uuid NOT NULL REFERENCES property_digitizations,
 organization_id uuid REFERENCES organizations,created_by uuid NOT NULL REFERENCES profiles,
 revision int NOT NULL CHECK(revision>0),created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(digitization_id,revision)
);
INSERT INTO digitization_input_slots(digitization_id,organization_id,created_by,revision)
 SELECT digitization_id,organization_id,created_by,revision FROM property_input_revisions;
ALTER TABLE digitization_evidence_grants DROP CONSTRAINT evidence_grant_input_scope;
ALTER TABLE digitization_evidence_grants ADD CONSTRAINT evidence_grant_input_slot
 FOREIGN KEY(digitization_id,input_revision) REFERENCES digitization_input_slots(digitization_id,revision);

CREATE FUNCTION digitization_input_slot_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE parent property_digitizations;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Input reservations are immutable' USING ERRCODE='23514';END IF;
 SELECT * INTO parent FROM property_digitizations WHERE id=NEW.digitization_id FOR UPDATE;
 IF parent.id IS NULL OR parent.organization_id IS DISTINCT FROM NEW.organization_id OR NEW.created_by<>actor_id()
 OR parent.state<>'active' OR NEW.revision<>parent.current_input_revision+1
 OR NOT digitization_target_access(parent.id) THEN
  RAISE EXCEPTION 'Current next-revision authority required' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER input_slot_guard BEFORE INSERT OR UPDATE OR DELETE ON digitization_input_slots FOR EACH ROW EXECUTE FUNCTION digitization_input_slot_guard();
ALTER TABLE digitization_input_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY input_slot_read ON digitization_input_slots FOR SELECT USING(digitization_target_access(digitization_id));
CREATE POLICY input_slot_create ON digitization_input_slots FOR INSERT WITH CHECK(created_by=actor_id() AND digitization_target_access(digitization_id));

CREATE FUNCTION digitization_reserve_snapshot_slot() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM digitization_input_slots WHERE digitization_id=NEW.digitization_id AND revision=NEW.revision) THEN
  INSERT INTO digitization_input_slots(digitization_id,organization_id,created_by,revision) VALUES(NEW.digitization_id,NEW.organization_id,NEW.created_by,NEW.revision);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER input_snapshot_slot BEFORE INSERT ON property_input_revisions FOR EACH ROW EXECUTE FUNCTION digitization_reserve_snapshot_slot();
ALTER TABLE property_input_revisions ADD CONSTRAINT input_snapshot_slot_scope
 FOREIGN KEY(digitization_id,revision) REFERENCES digitization_input_slots(digitization_id,revision);

CREATE OR REPLACE FUNCTION digitization_grant_revision_exists(engine uuid,revision_ref int) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT digitization_target_access(engine) AND EXISTS(
 SELECT 1 FROM digitization_input_slots s JOIN property_digitizations p ON p.id=s.digitization_id
 WHERE s.digitization_id=engine AND s.revision=revision_ref AND
 (s.revision=p.current_input_revision+1 OR EXISTS(SELECT 1 FROM property_input_revisions r WHERE r.digitization_id=engine AND r.revision=revision_ref)))
$$;

CREATE FUNCTION digitization_sources_access(engine uuid,revision_ref int,sources jsonb,access_purpose text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT digitization_target_access(engine) AND jsonb_typeof(sources)='array' AND NOT EXISTS(
 SELECT 1 FROM jsonb_array_elements(sources) source WHERE
 NOT coalesce(digitization_asset_access(engine,(source->>'assetId')::uuid,(source->>'assetVersion')::int,revision_ref,access_purpose),false))
$$;
CREATE FUNCTION digitization_revision_access(engine uuid,revision_ref int,access_purpose text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM property_input_revisions r WHERE r.digitization_id=engine AND r.revision=revision_ref
 AND digitization_sources_access(engine,revision_ref,r.source_set,access_purpose))
$$;
DROP POLICY engine_read ON property_input_revisions;
CREATE POLICY engine_read ON property_input_revisions FOR SELECT USING(
 digitization_revision_access(digitization_id,revision,'preview') OR digitization_revision_access(digitization_id,revision,'document_processing'));
DROP POLICY engine_create ON property_input_revisions;
CREATE POLICY engine_create ON property_input_revisions FOR INSERT WITH CHECK(created_by=actor_id() AND digitization_sources_access(digitization_id,revision,source_set,'document_processing'));
DROP POLICY engine_read ON digitization_asset_bindings;
CREATE POLICY engine_read ON digitization_asset_bindings FOR SELECT USING(
 digitization_asset_access(digitization_id,asset_id,asset_version,input_revision,'preview') OR digitization_asset_access(digitization_id,asset_id,asset_version,input_revision,'document_processing'));
DROP POLICY engine_create ON digitization_asset_bindings;
CREATE POLICY engine_create ON digitization_asset_bindings FOR INSERT WITH CHECK(created_by=actor_id() AND digitization_asset_access(digitization_id,asset_id,asset_version,input_revision,'document_processing'));

DO $$DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['processing_runs','processing_stages'] LOOP
  EXECUTE format('DROP POLICY engine_read ON %I',t);
  EXECUTE format('CREATE POLICY engine_read ON %I FOR SELECT USING(digitization_revision_access(digitization_id,input_revision,''document_processing''))',t);
  EXECUTE format('DROP POLICY engine_update ON %I',t);
  EXECUTE format('CREATE POLICY engine_update ON %I FOR UPDATE USING(digitization_revision_access(digitization_id,input_revision,''document_processing'')) WITH CHECK(digitization_revision_access(digitization_id,input_revision,''document_processing''))',t);
  EXECUTE format('DROP POLICY engine_create ON %I',t);
  EXECUTE format('CREATE POLICY engine_create ON %I FOR INSERT WITH CHECK(created_by=actor_id() AND digitization_revision_access(digitization_id,input_revision,''document_processing'') AND state=%L %s)',t,CASE t WHEN 'processing_runs' THEN 'draft' ELSE 'pending' END,CASE t WHEN 'processing_stages' THEN 'AND attempt=0 AND fencing_token=0 AND lease_until IS NULL AND execution_id IS NULL' ELSE '' END);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['document_pages','fact_candidates','artifacts','tour_revisions'] LOOP
  EXECUTE format('DROP POLICY engine_read ON %I',t);
  EXECUTE format('CREATE POLICY engine_read ON %I FOR SELECT USING(digitization_revision_access(digitization_id,input_revision,''preview''))',t);
  EXECUTE format('DROP POLICY engine_create ON %I',t);
  EXECUTE format('CREATE POLICY engine_create ON %I FOR INSERT WITH CHECK(created_by=actor_id() AND digitization_revision_access(digitization_id,input_revision,''document_processing'') %s)',t,CASE t WHEN 'artifacts' THEN 'AND status=''private'' AND privacy_status=''pending''' ELSE '' END);
 END LOOP;
END $$;
-- Redacted timeline rows contain no private values/source paths.
DROP POLICY engine_read ON digitization_events;
CREATE POLICY engine_read ON digitization_events FOR SELECT USING(digitization_target_access(digitization_id));
DROP POLICY engine_create ON digitization_events;
CREATE POLICY engine_create ON digitization_events FOR INSERT WITH CHECK(created_by=actor_id() AND digitization_target_access(digitization_id));
DROP POLICY engine_create ON stage_attempts;
CREATE POLICY engine_create ON stage_attempts FOR INSERT WITH CHECK(created_by=actor_id() AND EXISTS(
 SELECT 1 FROM processing_stages s WHERE s.id=stage_id AND s.digitization_id=stage_attempts.digitization_id
 AND digitization_revision_access(s.digitization_id,s.input_revision,'document_processing')));

-- Internal edit metadata can remove revoked sources without reading their bytes.
CREATE FUNCTION digitization_current_input_manifest(engine uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT r.source_set FROM property_input_revisions r JOIN property_digitizations p ON p.id=r.digitization_id
 WHERE p.id=engine AND r.revision=p.current_input_revision AND digitization_target_access(engine)
$$;
CREATE FUNCTION digitization_current_binding_ref(engine uuid,binding uuid) RETURNS TABLE(asset_id uuid,purpose text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT b.asset_id,b.purpose FROM digitization_asset_bindings b JOIN property_digitizations p ON p.id=b.digitization_id
 WHERE p.id=engine AND b.id=binding AND b.input_revision=p.current_input_revision AND digitization_target_access(engine)
$$;
