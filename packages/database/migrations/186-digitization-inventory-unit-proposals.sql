-- Physical-unit concurrency is separate from each agency's listing revision.
CREATE TABLE inventory_unit_fact_versions(unit_id uuid PRIMARY KEY REFERENCES units ON DELETE CASCADE,version integer NOT NULL DEFAULT 1 CHECK(version>0));
INSERT INTO inventory_unit_fact_versions(unit_id) SELECT id FROM units;
ALTER TABLE inventory_unit_fact_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY unit_fact_version_read ON inventory_unit_fact_versions FOR SELECT USING(true);
CREATE FUNCTION inventory_unit_fact_version_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='INSERT' THEN INSERT INTO inventory_unit_fact_versions(unit_id) VALUES(NEW.id);
 ELSIF ROW(NEW.organization_id,NEW.unit_kind,NEW.community_id,NEW.building_id,NEW.area,NEW.beds,NEW.living_rooms,NEW.baths,NEW.orientation,NEW.floor,NEW.elevator) IS DISTINCT FROM ROW(OLD.organization_id,OLD.unit_kind,OLD.community_id,OLD.building_id,OLD.area,OLD.beds,OLD.living_rooms,OLD.baths,OLD.orientation,OLD.floor,OLD.elevator) THEN
  UPDATE inventory_unit_fact_versions SET version=version+1 WHERE unit_id=NEW.id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER unit_fact_version AFTER INSERT OR UPDATE ON units FOR EACH ROW EXECUTE FUNCTION inventory_unit_fact_version_guard();
CREATE TABLE digitization_inventory_applications(
 revision_id uuid PRIMARY KEY REFERENCES listing_revisions,
 digitization_id uuid NOT NULL REFERENCES property_digitizations,organization_id uuid NOT NULL REFERENCES organizations,
 created_by uuid NOT NULL REFERENCES profiles,input_revision integer NOT NULL,
 unit_id uuid NOT NULL REFERENCES units,unit_version integer NOT NULL CHECK(unit_version>0),
 unit_patch jsonb NOT NULL CHECK(jsonb_typeof(unit_patch)='object'),decision_ids uuid[] NOT NULL CHECK(cardinality(decision_ids) BETWEEN 1 AND 20),
 geography_versions jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(geography_versions)='object'),created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(digitization_id,input_revision) REFERENCES property_input_revisions(digitization_id,revision)
);
ALTER TABLE digitization_inventory_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY unit_application_read ON digitization_inventory_applications FOR SELECT USING(created_by=actor_id() AND digitization_revision_access(digitization_id,input_revision,'preview'));
CREATE POLICY unit_application_create ON digitization_inventory_applications FOR INSERT WITH CHECK(created_by=actor_id() AND organization_id=org_id() AND digitization_revision_access(digitization_id,input_revision,'document_processing'));
CREATE FUNCTION digitization_inventory_application_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE engine property_digitizations;revision listing_revisions;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Inventory application lineage is immutable' USING ERRCODE='23514';END IF;
 SELECT * INTO engine FROM property_digitizations WHERE id=NEW.digitization_id FOR UPDATE;
 SELECT * INTO revision FROM listing_revisions WHERE id=NEW.revision_id;
 IF engine.id IS NULL OR engine.state<>'active' OR engine.target_type<>'listing' OR engine.unit_id<>NEW.unit_id OR engine.organization_id<>NEW.organization_id OR engine.current_input_revision<>NEW.input_revision OR NEW.created_by<>actor_id() OR revision.actor_id<>actor_id() OR revision.status<>'pending' OR revision.listing_id<>engine.listing_id OR revision.changes->'unitFacts'->'patch' IS DISTINCT FROM NEW.unit_patch OR (revision.changes->'unitFacts'->>'unitVersion')::integer IS DISTINCT FROM NEW.unit_version OR NOT digitization_revision_access(engine.id,NEW.input_revision,'document_processing') OR NOT EXISTS(SELECT 1 FROM listings l JOIN inventory_unit_fact_versions v ON v.unit_id=l.unit_id WHERE l.id=revision.listing_id AND l.version=revision.base_version AND l.status='published' AND v.version=NEW.unit_version) THEN
  RAISE EXCEPTION 'Current private unit application lineage required' USING ERRCODE='23514';END IF;
 IF octet_length(NEW.unit_patch::text)>8192 OR octet_length(NEW.geography_versions::text)>4096 THEN RAISE EXCEPTION 'Unit proposal budget exceeded' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER unit_application_guard BEFORE INSERT OR UPDATE OR DELETE ON digitization_inventory_applications FOR EACH ROW EXECUTE FUNCTION digitization_inventory_application_guard();
CREATE FUNCTION digitization_inventory_application_current(revision_ref uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(
 SELECT 1 FROM digitization_inventory_applications app JOIN property_digitizations engine ON engine.id=app.digitization_id JOIN property_input_revisions inputs ON inputs.digitization_id=engine.id AND inputs.revision=app.input_revision JOIN listing_revisions revision ON revision.id=app.revision_id JOIN listings l ON l.id=revision.listing_id JOIN inventory_unit_fact_versions unit_version ON unit_version.unit_id=l.unit_id
 WHERE app.revision_id=revision_ref AND engine.state='active' AND engine.target_type='listing' AND engine.listing_id=l.id AND engine.unit_id=app.unit_id AND l.unit_id=app.unit_id AND engine.organization_id=app.organization_id AND l.organization_id=app.organization_id AND engine.current_input_revision=app.input_revision AND unit_version.version=app.unit_version AND revision.status='pending' AND l.status='published' AND l.version=revision.base_version AND revision.actor_id=app.created_by AND revision.changes->'unitFacts'->'patch'=app.unit_patch AND (revision.changes->'unitFacts'->>'unitVersion')::integer=app.unit_version AND
 (actor_id()=app.created_by AND digitization_target_access(engine.id) OR EXISTS(SELECT 1 FROM profiles p JOIN memberships m ON m.user_id=p.id AND m.status='active' AND m.role IN('moderator','admin') WHERE p.id=actor_id() AND p.state='active')) AND
 digitization_actor_target(app.created_by,engine.organization_id,engine.created_by,engine.target_type,engine.target_id,engine.unit_id) AND
 NOT EXISTS(SELECT 1 FROM jsonb_array_elements(inputs.source_set) source WHERE NOT EXISTS(
 SELECT 1 FROM media_assets asset WHERE asset.id=(source->>'assetId')::uuid AND asset.version=(source->>'assetVersion')::integer AND asset.status='approved' AND asset.scan_at IS NOT NULL AND length(asset.rights)>=3 AND (asset.owner_id=app.created_by OR EXISTS(SELECT 1 FROM digitization_evidence_grants grant_record WHERE grant_record.digitization_id=engine.id AND grant_record.asset_id=asset.id AND grant_record.asset_version=asset.version AND grant_record.owner_id=asset.owner_id AND grant_record.grantee_id=app.created_by AND grant_record.input_revision=app.input_revision AND grant_record.state='active' AND grant_record.expires_at>statement_timestamp() AND 'document_processing'=ANY(grant_record.purposes))))) AND
 (SELECT count(*) FROM fact_decisions decision JOIN fact_candidates candidate ON candidate.id=decision.candidate_id AND candidate.digitization_id=decision.digitization_id WHERE decision.id=ANY(app.decision_ids) AND decision.digitization_id=engine.id AND candidate.input_revision=app.input_revision AND decision.candidate_version=candidate.version AND decision.decision IN('accepted','corrected') AND NOT EXISTS(SELECT 1 FROM fact_decisions newer WHERE newer.candidate_id=candidate.id AND newer.digitization_id=engine.id AND newer.id<>decision.id AND newer.created_at>=decision.created_at))=cardinality(app.decision_ids) AND
 (NOT (app.unit_patch?'communityId') OR EXISTS(SELECT 1 FROM communities community JOIN districts district ON district.id=community.district_id JOIN cities city ON city.id=district.city_id WHERE community.id=(app.unit_patch->>'communityId')::uuid AND community.status='active' AND district.status='active' AND city.status='active' AND community.version=(app.geography_versions->>'community')::integer AND district.version=(app.geography_versions->>'district')::integer AND city.version=(app.geography_versions->>'city')::integer))
 )
$$;
CREATE FUNCTION digitization_inventory_review_unit_lock(revision_ref uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE unit_ref uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM profiles p JOIN memberships m ON m.user_id=p.id AND m.status='active' AND m.role IN('moderator','admin') WHERE p.id=actor_id() AND p.state='active') THEN RAISE EXCEPTION 'Current inventory reviewer required' USING ERRCODE='42501';END IF;
 SELECT unit.id INTO unit_ref FROM units unit JOIN digitization_inventory_applications app ON app.unit_id=unit.id JOIN listing_revisions revision ON revision.id=app.revision_id JOIN listings l ON l.id=revision.listing_id WHERE app.revision_id=revision_ref AND revision.status='pending' AND revision.actor_id<>actor_id() AND l.owner_id IS DISTINCT FROM actor_id() AND NOT EXISTS(SELECT 1 FROM agents agent WHERE agent.id=l.agent_id AND agent.user_id=actor_id()) FOR UPDATE OF unit;
 RETURN unit_ref;
END $$;
REVOKE ALL ON FUNCTION digitization_inventory_application_current(uuid),digitization_inventory_review_unit_lock(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION digitization_inventory_application_current(uuid),digitization_inventory_review_unit_lock(uuid) TO haven_app;

CREATE FUNCTION digitization_pending_unit_binding_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.changes?'unitFacts' AND (NEW.changes->'unitFacts' IS DISTINCT FROM OLD.changes->'unitFacts' OR NEW.actor_id<>OLD.actor_id OR NEW.listing_id<>OLD.listing_id OR NEW.base_version<>OLD.base_version) THEN RAISE EXCEPTION 'Unit proposal binding is immutable' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER unit_proposal_identity BEFORE UPDATE ON listing_revisions FOR EACH ROW EXECUTE FUNCTION digitization_pending_unit_binding_guard();
