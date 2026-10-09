-- Inventory-owned engine ledger. Existing resource identities remain authoritative.
CREATE FUNCTION digitization_actor_target(who uuid,workspace uuid,creator uuid,kind text,target uuid,unit_ref uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM profiles WHERE id=who AND state='active') AND CASE kind
 WHEN 'intake' THEN who=creator AND workspace IS NOT NULL AND EXISTS(
  SELECT 1 FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=who AND m.organization_id=workspace AND m.status='active' AND m.role IN('agent','agency_manager') AND o.type='agency')
 WHEN 'listing' THEN EXISTS(SELECT 1 FROM listings l JOIN units u ON u.id=l.unit_id WHERE l.id=target AND l.organization_id=workspace AND l.unit_id=unit_ref AND (
  (l.owner_id=who AND EXISTS(SELECT 1 FROM owner_unit_grants g WHERE g.owner_id=who AND g.unit_id=l.unit_id AND g.status='active' AND (g.expires_at IS NULL OR g.expires_at>statement_timestamp()))) OR
  (EXISTS(SELECT 1 FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=who AND m.organization_id=workspace AND m.status='active' AND o.type='agency' AND (m.role='agency_manager' OR m.role='agent' AND EXISTS(SELECT 1 FROM agents a WHERE a.id=l.agent_id AND a.user_id=who AND a.organization_id=workspace))) AND
   (u.organization_id=workspace OR EXISTS(SELECT 1 FROM listing_mandates mandate WHERE mandate.unit_id=l.unit_id AND mandate.organization_id=workspace AND mandate.owner_id=l.owner_id AND mandate.status='active' AND mandate.starts_at<=statement_timestamp() AND mandate.expires_at>statement_timestamp())))))
 WHEN 'owner_submission' THEN workspace IS NULL AND who=creator AND EXISTS(SELECT 1 FROM owner_submissions os WHERE os.id=target AND os.user_id=who AND os.status IN('draft','submitted','needs_changes'))
 WHEN 'development_floor_type' THEN EXISTS(SELECT 1 FROM floor_plans f JOIN developments d ON d.id=f.development_id JOIN memberships m ON m.organization_id=d.organization_id WHERE f.id=target AND d.organization_id=workspace AND m.user_id=who AND m.status='active' AND m.role='developer')
 ELSE false END
$$;
CREATE TABLE property_digitizations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid REFERENCES organizations,created_by uuid NOT NULL REFERENCES profiles,
 target_type text NOT NULL CHECK(target_type IN('listing','intake','owner_submission','development_floor_type')),target_id uuid NOT NULL,
 unit_id uuid REFERENCES units,listing_id uuid REFERENCES listings,state text NOT NULL DEFAULT 'active' CHECK(state IN('active','archived')),
 version int NOT NULL DEFAULT 1 CHECK(version>0),current_input_revision int NOT NULL DEFAULT 0 CHECK(current_input_revision>=0),created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((target_type='listing' AND listing_id=target_id AND unit_id IS NOT NULL) OR (target_type<>'listing' AND listing_id IS NULL AND unit_id IS NULL)),
 CHECK(target_type<>'intake' OR target_id=id)
);
CREATE UNIQUE INDEX digitization_active_target ON property_digitizations(coalesce(organization_id,created_by),target_type,target_id) WHERE state='active';
CREATE FUNCTION digitization_target_access(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM property_digitizations d WHERE d.id=target AND d.state='active' AND digitization_actor_target(actor_id(),d.organization_id,d.created_by,d.target_type,d.target_id,d.unit_id) AND
 (d.organization_id IS NULL OR d.organization_id=org_id() OR EXISTS(SELECT 1 FROM listings l WHERE d.target_type='listing' AND l.id=d.target_id AND l.owner_id=actor_id())))
$$;
CREATE TABLE digitization_evidence_grants(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),digitization_id uuid NOT NULL REFERENCES property_digitizations,organization_id uuid REFERENCES organizations,
 asset_id uuid NOT NULL REFERENCES media_assets,asset_version int NOT NULL CHECK(asset_version>0),input_revision int NOT NULL CHECK(input_revision>0),
 owner_id uuid NOT NULL REFERENCES profiles,grantee_id uuid NOT NULL REFERENCES profiles,granted_by uuid NOT NULL REFERENCES profiles,
 purposes text[] NOT NULL CHECK(cardinality(purposes)>0 AND purposes<@ARRAY['preview','document_processing']::text[]),
 state text NOT NULL DEFAULT 'active' CHECK(state IN('active','revoked')),version int NOT NULL DEFAULT 1 CHECK(version>0),
 expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),CHECK(expires_at>created_at),UNIQUE(id,digitization_id)
);
CREATE FUNCTION digitization_asset_access(engine uuid,asset uuid,asset_rev int,revision int,purpose text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT digitization_target_access(engine) AND EXISTS(SELECT 1 FROM media_assets a WHERE a.id=asset AND a.version=asset_rev AND a.status='approved' AND a.scan_at IS NOT NULL AND length(a.rights)>=3 AND (
 a.owner_id=actor_id() OR EXISTS(SELECT 1 FROM digitization_evidence_grants g WHERE g.digitization_id=engine AND g.asset_id=a.id AND g.asset_version=a.version AND g.owner_id=a.owner_id AND g.grantee_id=actor_id() AND g.input_revision=revision AND purpose=ANY(g.purposes) AND g.state='active' AND g.expires_at>statement_timestamp())))
$$;
CREATE TABLE property_input_revisions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),digitization_id uuid NOT NULL REFERENCES property_digitizations,organization_id uuid REFERENCES organizations,created_by uuid NOT NULL REFERENCES profiles,version int NOT NULL DEFAULT 1 CHECK(version>0),created_at timestamptz NOT NULL DEFAULT now(),
 revision int NOT NULL CHECK(revision>0),source_set jsonb NOT NULL CHECK(jsonb_typeof(source_set)='array'),configuration jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(configuration)='object'),UNIQUE(digitization_id,revision),UNIQUE(id,digitization_id)
);
CREATE TABLE digitization_asset_bindings(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),digitization_id uuid NOT NULL REFERENCES property_digitizations,organization_id uuid REFERENCES organizations,created_by uuid NOT NULL REFERENCES profiles,version int NOT NULL DEFAULT 1 CHECK(version>0),created_at timestamptz NOT NULL DEFAULT now(),
 input_revision int NOT NULL,asset_id uuid NOT NULL REFERENCES media_assets,asset_version int NOT NULL CHECK(asset_version>0),purpose text NOT NULL CHECK(purpose IN('document','plan','photo','video','panorama')),sensitivity text NOT NULL CHECK(sensitivity IN('private_evidence','private_capture','gallery')),source_lineage jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(source_lineage)='object'),FOREIGN KEY(digitization_id,input_revision) REFERENCES property_input_revisions(digitization_id,revision),UNIQUE(digitization_id,input_revision,asset_id,purpose),UNIQUE(id,digitization_id)
);
CREATE FUNCTION digitization_private_access(engine uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT digitization_target_access(engine) AND NOT EXISTS(SELECT 1 FROM digitization_asset_bindings b WHERE b.digitization_id=engine AND NOT digitization_asset_access(engine,b.asset_id,b.asset_version,b.input_revision,'preview'))
$$;
CREATE TABLE document_pages(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),digitization_id uuid NOT NULL REFERENCES property_digitizations,organization_id uuid REFERENCES organizations,created_by uuid NOT NULL REFERENCES profiles,version int NOT NULL DEFAULT 1 CHECK(version>0),created_at timestamptz NOT NULL DEFAULT now(),
 binding_id uuid NOT NULL,input_revision int NOT NULL,page int NOT NULL CHECK(page BETWEEN 1 AND 50),preview_artifact_id uuid,orientation_transform jsonb NOT NULL CHECK(jsonb_typeof(orientation_transform)='array' AND jsonb_array_length(orientation_transform)=9),ocr_tokens jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(ocr_tokens)='array'),FOREIGN KEY(binding_id,digitization_id) REFERENCES digitization_asset_bindings(id,digitization_id),FOREIGN KEY(digitization_id,input_revision) REFERENCES property_input_revisions(digitization_id,revision),UNIQUE(binding_id,page),UNIQUE(id,digitization_id)
);
CREATE TABLE fact_candidates(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),digitization_id uuid NOT NULL REFERENCES property_digitizations,organization_id uuid REFERENCES organizations,created_by uuid NOT NULL REFERENCES profiles,version int NOT NULL DEFAULT 1 CHECK(version>0),created_at timestamptz NOT NULL DEFAULT now(),
 input_revision int NOT NULL,field text NOT NULL,candidate jsonb NOT NULL CHECK(jsonb_typeof(candidate)='object'),extractor_version text NOT NULL,FOREIGN KEY(digitization_id,input_revision) REFERENCES property_input_revisions(digitization_id,revision),UNIQUE(id,digitization_id)
);
CREATE TABLE fact_decisions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),digitization_id uuid NOT NULL REFERENCES property_digitizations,organization_id uuid REFERENCES organizations,created_by uuid NOT NULL REFERENCES profiles,version int NOT NULL DEFAULT 1 CHECK(version>0),created_at timestamptz NOT NULL DEFAULT now(),
 candidate_id uuid NOT NULL,candidate_version int NOT NULL CHECK(candidate_version>0),decision text NOT NULL CHECK(decision IN('accepted','corrected','rejected','unknown','conflict')),value jsonb,note text CHECK(length(note)<=500),FOREIGN KEY(candidate_id,digitization_id) REFERENCES fact_candidates(id,digitization_id),UNIQUE(id,digitization_id)
);
CREATE TABLE geometry_revisions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),digitization_id uuid NOT NULL REFERENCES property_digitizations,organization_id uuid REFERENCES organizations,created_by uuid NOT NULL REFERENCES profiles,version int NOT NULL DEFAULT 1 CHECK(version>0),created_at timestamptz NOT NULL DEFAULT now(),
 revision int NOT NULL CHECK(revision>0),parent_id uuid,schema_version int NOT NULL CHECK(schema_version=2),geometry jsonb NOT NULL CHECK(jsonb_typeof(geometry)='object'),scale_status text NOT NULL CHECK(scale_status IN('unscaled','estimated','measured','legacy_supplied_unverified')),FOREIGN KEY(parent_id,digitization_id) REFERENCES geometry_revisions(id,digitization_id),UNIQUE(digitization_id,revision),UNIQUE(id,digitization_id)
);
CREATE TABLE capture_sessions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),digitization_id uuid NOT NULL REFERENCES property_digitizations,organization_id uuid REFERENCES organizations,created_by uuid NOT NULL REFERENCES profiles,version int NOT NULL DEFAULT 1 CHECK(version>0),created_at timestamptz NOT NULL DEFAULT now(),
 state text NOT NULL DEFAULT 'draft' CHECK(state IN('draft','recording','complete','cancelled')),room_checklist jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(room_checklist)='array'),clips jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(clips)='array'),device_metadata jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(device_metadata)='object'),UNIQUE(id,digitization_id)
);
CREATE TABLE processing_runs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),digitization_id uuid NOT NULL REFERENCES property_digitizations,organization_id uuid REFERENCES organizations,created_by uuid NOT NULL REFERENCES profiles,version int NOT NULL DEFAULT 1 CHECK(version>0),created_at timestamptz NOT NULL DEFAULT now(),
 input_revision int NOT NULL,state text NOT NULL DEFAULT 'draft' CHECK(state IN('draft','queued','running','awaiting_input','awaiting_review','ready','partially_ready','failed','cancel_requested','cancelled')),desired_outputs text[] NOT NULL,budget jsonb NOT NULL CHECK(jsonb_typeof(budget)='object'),deadline timestamptz NOT NULL,cancel_requested_at timestamptz,FOREIGN KEY(digitization_id,input_revision) REFERENCES property_input_revisions(digitization_id,revision),UNIQUE(id,digitization_id)
);
CREATE TABLE processing_stages(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),digitization_id uuid NOT NULL REFERENCES property_digitizations,organization_id uuid REFERENCES organizations,created_by uuid NOT NULL REFERENCES profiles,version int NOT NULL DEFAULT 1 CHECK(version>0),created_at timestamptz NOT NULL DEFAULT now(),
 run_id uuid NOT NULL,stage_type text NOT NULL CHECK(stage_type IN('document_classify','document_rasterize','document_ocr','fact_extract','plan_trace','geometry_render','media_probe','frame_select','panorama_optimize','camera_solve','splat_train','scene_export','assemble')),state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','queued','leased','running','succeeded','failed_retryable','failed_terminal','awaiting_input','skipped','cancelled')),input_revision int NOT NULL,input_fingerprint text NOT NULL CHECK(input_fingerprint~'^[a-f0-9]{64}$'),profile_id text NOT NULL,attempt int NOT NULL DEFAULT 0 CHECK(attempt BETWEEN 0 AND 10),fencing_token bigint NOT NULL DEFAULT 0 CHECK(fencing_token>=0),lease_until timestamptz,execution_id uuid,progress jsonb,error_code text,FOREIGN KEY(run_id,digitization_id) REFERENCES processing_runs(id,digitization_id),FOREIGN KEY(digitization_id,input_revision) REFERENCES property_input_revisions(digitization_id,revision),UNIQUE(id,digitization_id)
);
CREATE TABLE processing_stage_dependencies(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),digitization_id uuid NOT NULL REFERENCES property_digitizations,organization_id uuid REFERENCES organizations,created_by uuid NOT NULL REFERENCES profiles,version int NOT NULL DEFAULT 1 CHECK(version>0),created_at timestamptz NOT NULL DEFAULT now(),
 stage_id uuid NOT NULL,dependency_id uuid NOT NULL,CHECK(stage_id<>dependency_id),FOREIGN KEY(stage_id,digitization_id) REFERENCES processing_stages(id,digitization_id),FOREIGN KEY(dependency_id,digitization_id) REFERENCES processing_stages(id,digitization_id),UNIQUE(stage_id,dependency_id),UNIQUE(id,digitization_id)
);
CREATE TABLE stage_attempts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),digitization_id uuid NOT NULL REFERENCES property_digitizations,organization_id uuid REFERENCES organizations,created_by uuid NOT NULL REFERENCES profiles,version int NOT NULL DEFAULT 1 CHECK(version>0),created_at timestamptz NOT NULL DEFAULT now(),
 stage_id uuid NOT NULL,execution_id uuid NOT NULL UNIQUE,attempt int NOT NULL CHECK(attempt>0),fencing_token bigint NOT NULL CHECK(fencing_token>0),started_at timestamptz NOT NULL DEFAULT now(),ended_at timestamptz,diagnostics jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(diagnostics)='object'),FOREIGN KEY(stage_id,digitization_id) REFERENCES processing_stages(id,digitization_id),UNIQUE(stage_id,attempt),UNIQUE(id,digitization_id)
);
CREATE TABLE artifacts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),digitization_id uuid NOT NULL REFERENCES property_digitizations,organization_id uuid REFERENCES organizations,created_by uuid NOT NULL REFERENCES profiles,version int NOT NULL DEFAULT 1 CHECK(version>0),created_at timestamptz NOT NULL DEFAULT now(),
 run_id uuid NOT NULL,stage_id uuid NOT NULL,input_revision int NOT NULL,input_fingerprint text NOT NULL CHECK(input_fingerprint~'^[a-f0-9]{64}$'),object_key text NOT NULL UNIQUE,checksum text NOT NULL CHECK(checksum~'^[a-f0-9]{64}$'),byte_size bigint NOT NULL CHECK(byte_size>0),format text NOT NULL,profile_id text NOT NULL,software_versions jsonb NOT NULL CHECK(jsonb_typeof(software_versions)='object'),quality_report jsonb NOT NULL CHECK(jsonb_typeof(quality_report)='object'),privacy_status text NOT NULL DEFAULT 'pending' CHECK(privacy_status IN('pending','passed','rejected')),status text NOT NULL DEFAULT 'private' CHECK(status IN('private','validated','rejected','revoked')),FOREIGN KEY(run_id,digitization_id) REFERENCES processing_runs(id,digitization_id),FOREIGN KEY(stage_id,digitization_id) REFERENCES processing_stages(id,digitization_id),FOREIGN KEY(digitization_id,input_revision) REFERENCES property_input_revisions(digitization_id,revision),UNIQUE(id,digitization_id)
);
ALTER TABLE document_pages ADD CONSTRAINT document_page_preview_scope FOREIGN KEY(preview_artifact_id,digitization_id) REFERENCES artifacts(id,digitization_id);
CREATE TABLE tour_revisions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),digitization_id uuid NOT NULL REFERENCES property_digitizations,organization_id uuid REFERENCES organizations,created_by uuid NOT NULL REFERENCES profiles,version int NOT NULL DEFAULT 1 CHECK(version>0),created_at timestamptz NOT NULL DEFAULT now(),
 revision int NOT NULL CHECK(revision>0),input_revision int NOT NULL,graph jsonb NOT NULL CHECK(jsonb_typeof(graph)='object'),FOREIGN KEY(digitization_id,input_revision) REFERENCES property_input_revisions(digitization_id,revision),UNIQUE(digitization_id,revision),UNIQUE(id,digitization_id)
);
CREATE TABLE approval_records(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),digitization_id uuid NOT NULL REFERENCES property_digitizations,organization_id uuid REFERENCES organizations,created_by uuid NOT NULL REFERENCES profiles,version int NOT NULL DEFAULT 1 CHECK(version>0),created_at timestamptz NOT NULL DEFAULT now(),
 input_revision int NOT NULL,scope text NOT NULL CHECK(scope IN('facts','geometry','artifact','package')),snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),decision text NOT NULL CHECK(decision IN('approved','rejected','revoked')),reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 1000),FOREIGN KEY(digitization_id,input_revision) REFERENCES property_input_revisions(digitization_id,revision),UNIQUE(id,digitization_id)
);
CREATE TABLE published_packages(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),digitization_id uuid NOT NULL REFERENCES property_digitizations,organization_id uuid REFERENCES organizations,created_by uuid NOT NULL REFERENCES profiles,version int NOT NULL DEFAULT 1 CHECK(version>0),created_at timestamptz NOT NULL DEFAULT now(),
 listing_id uuid NOT NULL REFERENCES listings,listing_version int NOT NULL CHECK(listing_version>0),input_revision int NOT NULL,approval_id uuid NOT NULL,manifest jsonb NOT NULL CHECK(jsonb_typeof(manifest)='object'),state text NOT NULL DEFAULT 'active' CHECK(state IN('active','revoked')),FOREIGN KEY(approval_id,digitization_id) REFERENCES approval_records(id,digitization_id),FOREIGN KEY(digitization_id,input_revision) REFERENCES property_input_revisions(digitization_id,revision),UNIQUE(id,digitization_id)
);
CREATE TABLE digitization_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),digitization_id uuid NOT NULL REFERENCES property_digitizations,organization_id uuid REFERENCES organizations,created_by uuid NOT NULL REFERENCES profiles,version int NOT NULL DEFAULT 1 CHECK(version>0),created_at timestamptz NOT NULL DEFAULT now(),
 sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,run_id uuid,kind text NOT NULL CHECK(kind~'^[a-z][a-z0-9_.]{1,100}$'),state text NOT NULL,FOREIGN KEY(run_id,digitization_id) REFERENCES processing_runs(id,digitization_id),UNIQUE(id,digitization_id)
);
CREATE FUNCTION digitization_row_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE parent property_digitizations;run processing_runs;candidate fact_candidates;binding digitization_asset_bindings;
BEGIN
 IF TG_TABLE_NAME='property_digitizations' THEN
  IF TG_OP='INSERT' AND (NEW.created_by<>actor_id() OR NEW.version<>1 OR NEW.state<>'active' OR NEW.current_input_revision<>0) THEN RAISE EXCEPTION 'Initial digitization actor and workflow required' USING ERRCODE='42501';END IF;
  IF TG_OP='UPDATE' AND (NEW.created_by<>OLD.created_by OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.target_type<>OLD.target_type OR NEW.target_id<>OLD.target_id OR NEW.unit_id IS DISTINCT FROM OLD.unit_id OR NEW.listing_id IS DISTINCT FROM OLD.listing_id OR NEW.version<>OLD.version+1 OR OLD.state<>'active' OR NEW.current_input_revision<OLD.current_input_revision) THEN RAISE EXCEPTION 'Immutable digitization identity and current version required' USING ERRCODE='23514';END IF;
  IF NOT digitization_actor_target(actor_id(),NEW.organization_id,NEW.created_by,NEW.target_type,NEW.target_id,NEW.unit_id) THEN RAISE EXCEPTION 'Current digitization target authority required' USING ERRCODE='42501';END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO parent FROM property_digitizations WHERE id=NEW.digitization_id;
 IF parent.id IS NULL OR NEW.organization_id IS DISTINCT FROM parent.organization_id THEN RAISE EXCEPTION 'Matching engine organization required' USING ERRCODE='23514';END IF;
 IF TG_TABLE_NAME='digitization_evidence_grants' THEN
  IF TG_OP='INSERT' AND (NEW.version<>1 OR NEW.state<>'active' OR NEW.expires_at>statement_timestamp()+interval '90 days' OR NEW.granted_by<>actor_id() OR NEW.owner_id<>actor_id() OR NOT EXISTS(SELECT 1 FROM media_assets a WHERE a.id=NEW.asset_id AND a.owner_id=actor_id() AND a.version=NEW.asset_version AND a.status='approved' AND a.scan_at IS NOT NULL AND a.visibility='private' AND a.purpose='document') OR NOT digitization_actor_target(NEW.grantee_id,parent.organization_id,parent.created_by,parent.target_type,parent.target_id,parent.unit_id)) THEN RAISE EXCEPTION 'Owner and scoped grantee processing grant required' USING ERRCODE='42501';END IF;
  IF TG_OP='UPDATE' AND (NEW.owner_id<>OLD.owner_id OR NEW.granted_by<>OLD.granted_by OR NEW.grantee_id<>OLD.grantee_id OR NEW.digitization_id<>OLD.digitization_id OR NEW.asset_id<>OLD.asset_id OR NEW.asset_version<>OLD.asset_version OR NEW.input_revision<>OLD.input_revision OR NEW.purposes<>OLD.purposes OR NEW.expires_at<>OLD.expires_at OR NEW.version<>OLD.version+1 OR OLD.state<>'active' OR NEW.state<>'revoked') THEN RAISE EXCEPTION 'Grant revocation requires immutable identity and version' USING ERRCODE='23514';END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF TG_TABLE_NAME NOT IN('capture_sessions','processing_runs','processing_stages') OR NEW.digitization_id<>OLD.digitization_id OR NEW.created_by<>OLD.created_by OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Immutable engine snapshot or stale version' USING ERRCODE='23514';END IF;
 ELSE
  IF NEW.created_by<>actor_id() OR NEW.version<>1 THEN RAISE EXCEPTION 'Current creator and initial version required' USING ERRCODE='42501';END IF;
 END IF;
 IF TG_TABLE_NAME='digitization_asset_bindings' AND NOT digitization_asset_access(NEW.digitization_id,NEW.asset_id,NEW.asset_version,NEW.input_revision,'document_processing') THEN RAISE EXCEPTION 'Explicit scoped processing authority required' USING ERRCODE='42501';END IF;
 IF TG_TABLE_NAME='document_pages' THEN
  SELECT * INTO binding FROM digitization_asset_bindings WHERE id=NEW.binding_id;IF binding.input_revision<>NEW.input_revision OR binding.purpose<>'document' THEN RAISE EXCEPTION 'Matching document input revision required' USING ERRCODE='23514';END IF;
 END IF;
 IF TG_TABLE_NAME='fact_decisions' THEN
  SELECT * INTO candidate FROM fact_candidates WHERE id=NEW.candidate_id;IF candidate.version<>NEW.candidate_version THEN RAISE EXCEPTION 'Current fact candidate required' USING ERRCODE='23514';END IF;
 END IF;
 IF TG_TABLE_NAME IN('processing_stages','artifacts') THEN
  SELECT * INTO run FROM processing_runs WHERE id=NEW.run_id;IF run.input_revision<>NEW.input_revision THEN RAISE EXCEPTION 'Matching run input revision required' USING ERRCODE='23514';END IF;
 END IF;
 IF TG_TABLE_NAME='artifacts' AND NOT EXISTS(SELECT 1 FROM processing_stages st WHERE st.id=NEW.stage_id AND st.run_id=NEW.run_id AND st.input_fingerprint=NEW.input_fingerprint) THEN RAISE EXCEPTION 'Matching artifact execution lineage required' USING ERRCODE='23514';END IF;
 IF TG_TABLE_NAME='processing_stage_dependencies' AND NOT EXISTS(SELECT 1 FROM processing_stages a JOIN processing_stages b ON a.run_id=b.run_id WHERE a.id=NEW.stage_id AND b.id=NEW.dependency_id) THEN RAISE EXCEPTION 'Dependencies must belong to the same run' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
ALTER TABLE property_digitizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY digitization_read ON property_digitizations FOR SELECT USING(digitization_target_access(id));
CREATE POLICY digitization_create ON property_digitizations FOR INSERT WITH CHECK(created_by=actor_id() AND digitization_actor_target(actor_id(),organization_id,created_by,target_type,target_id,unit_id) AND (organization_id=org_id() OR target_type='owner_submission' OR EXISTS(SELECT 1 FROM listings WHERE id=target_id AND owner_id=actor_id())));
CREATE POLICY digitization_update ON property_digitizations FOR UPDATE USING(digitization_target_access(id)) WITH CHECK(digitization_target_access(id) OR state='archived' AND digitization_actor_target(actor_id(),organization_id,created_by,target_type,target_id,unit_id));
CREATE TRIGGER digitization_guard BEFORE INSERT OR UPDATE ON property_digitizations FOR EACH ROW EXECUTE FUNCTION digitization_row_guard();
ALTER TABLE digitization_evidence_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY digitization_grant_read ON digitization_evidence_grants FOR SELECT USING(owner_id=actor_id() OR grantee_id=actor_id() AND digitization_target_access(digitization_id));
CREATE POLICY digitization_grant_create ON digitization_evidence_grants FOR INSERT WITH CHECK(owner_id=actor_id() AND granted_by=actor_id());
CREATE POLICY digitization_grant_revoke ON digitization_evidence_grants FOR UPDATE USING(owner_id=actor_id()) WITH CHECK(owner_id=actor_id());
CREATE TRIGGER digitization_grant_guard BEFORE INSERT OR UPDATE ON digitization_evidence_grants FOR EACH ROW EXECUTE FUNCTION digitization_row_guard();
ALTER TABLE property_input_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_read ON property_input_revisions FOR SELECT USING(digitization_private_access(digitization_id));
CREATE POLICY engine_create ON property_input_revisions FOR INSERT WITH CHECK(created_by=actor_id() AND digitization_private_access(digitization_id));
CREATE TRIGGER engine_guard BEFORE INSERT OR UPDATE ON property_input_revisions FOR EACH ROW EXECUTE FUNCTION digitization_row_guard();
CREATE INDEX property_input_revisions_engine ON property_input_revisions(digitization_id);
ALTER TABLE digitization_asset_bindings ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_read ON digitization_asset_bindings FOR SELECT USING(digitization_private_access(digitization_id));
CREATE POLICY engine_create ON digitization_asset_bindings FOR INSERT WITH CHECK(created_by=actor_id() AND digitization_private_access(digitization_id));
CREATE TRIGGER engine_guard BEFORE INSERT OR UPDATE ON digitization_asset_bindings FOR EACH ROW EXECUTE FUNCTION digitization_row_guard();
CREATE INDEX digitization_asset_bindings_engine ON digitization_asset_bindings(digitization_id);
ALTER TABLE document_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_read ON document_pages FOR SELECT USING(digitization_private_access(digitization_id));
CREATE POLICY engine_create ON document_pages FOR INSERT WITH CHECK(created_by=actor_id() AND digitization_private_access(digitization_id));
CREATE TRIGGER engine_guard BEFORE INSERT OR UPDATE ON document_pages FOR EACH ROW EXECUTE FUNCTION digitization_row_guard();
CREATE INDEX document_pages_engine ON document_pages(digitization_id);
ALTER TABLE fact_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_read ON fact_candidates FOR SELECT USING(digitization_private_access(digitization_id));
CREATE POLICY engine_create ON fact_candidates FOR INSERT WITH CHECK(created_by=actor_id() AND digitization_private_access(digitization_id));
CREATE TRIGGER engine_guard BEFORE INSERT OR UPDATE ON fact_candidates FOR EACH ROW EXECUTE FUNCTION digitization_row_guard();
CREATE INDEX fact_candidates_engine ON fact_candidates(digitization_id);
ALTER TABLE fact_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_read ON fact_decisions FOR SELECT USING(digitization_private_access(digitization_id));
CREATE POLICY engine_create ON fact_decisions FOR INSERT WITH CHECK(created_by=actor_id() AND digitization_private_access(digitization_id));
CREATE TRIGGER engine_guard BEFORE INSERT OR UPDATE ON fact_decisions FOR EACH ROW EXECUTE FUNCTION digitization_row_guard();
CREATE INDEX fact_decisions_engine ON fact_decisions(digitization_id);
ALTER TABLE geometry_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_read ON geometry_revisions FOR SELECT USING(digitization_private_access(digitization_id));
CREATE POLICY engine_create ON geometry_revisions FOR INSERT WITH CHECK(created_by=actor_id() AND digitization_private_access(digitization_id));
CREATE TRIGGER engine_guard BEFORE INSERT OR UPDATE ON geometry_revisions FOR EACH ROW EXECUTE FUNCTION digitization_row_guard();
CREATE INDEX geometry_revisions_engine ON geometry_revisions(digitization_id);
ALTER TABLE capture_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_read ON capture_sessions FOR SELECT USING(digitization_private_access(digitization_id));
CREATE POLICY engine_create ON capture_sessions FOR INSERT WITH CHECK(created_by=actor_id() AND digitization_private_access(digitization_id) AND state='draft');
CREATE POLICY engine_update ON capture_sessions FOR UPDATE USING(digitization_private_access(digitization_id)) WITH CHECK(digitization_private_access(digitization_id));
CREATE TRIGGER engine_guard BEFORE INSERT OR UPDATE ON capture_sessions FOR EACH ROW EXECUTE FUNCTION digitization_row_guard();
CREATE INDEX capture_sessions_engine ON capture_sessions(digitization_id);
ALTER TABLE processing_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_read ON processing_runs FOR SELECT USING(digitization_private_access(digitization_id));
CREATE POLICY engine_create ON processing_runs FOR INSERT WITH CHECK(created_by=actor_id() AND digitization_private_access(digitization_id) AND state='draft');
CREATE POLICY engine_update ON processing_runs FOR UPDATE USING(digitization_private_access(digitization_id)) WITH CHECK(digitization_private_access(digitization_id));
CREATE TRIGGER engine_guard BEFORE INSERT OR UPDATE ON processing_runs FOR EACH ROW EXECUTE FUNCTION digitization_row_guard();
CREATE INDEX processing_runs_engine ON processing_runs(digitization_id);
ALTER TABLE processing_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_read ON processing_stages FOR SELECT USING(digitization_private_access(digitization_id));
CREATE POLICY engine_create ON processing_stages FOR INSERT WITH CHECK(created_by=actor_id() AND digitization_private_access(digitization_id) AND state='pending' AND attempt=0 AND fencing_token=0 AND lease_until IS NULL AND execution_id IS NULL);
CREATE POLICY engine_update ON processing_stages FOR UPDATE USING(digitization_private_access(digitization_id)) WITH CHECK(digitization_private_access(digitization_id));
CREATE TRIGGER engine_guard BEFORE INSERT OR UPDATE ON processing_stages FOR EACH ROW EXECUTE FUNCTION digitization_row_guard();
CREATE INDEX processing_stages_engine ON processing_stages(digitization_id);
ALTER TABLE processing_stage_dependencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_read ON processing_stage_dependencies FOR SELECT USING(digitization_private_access(digitization_id));
CREATE POLICY engine_create ON processing_stage_dependencies FOR INSERT WITH CHECK(created_by=actor_id() AND digitization_private_access(digitization_id));
CREATE TRIGGER engine_guard BEFORE INSERT OR UPDATE ON processing_stage_dependencies FOR EACH ROW EXECUTE FUNCTION digitization_row_guard();
CREATE INDEX processing_stage_dependencies_engine ON processing_stage_dependencies(digitization_id);
ALTER TABLE stage_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_read ON stage_attempts FOR SELECT USING(digitization_private_access(digitization_id));
CREATE POLICY engine_create ON stage_attempts FOR INSERT WITH CHECK(created_by=actor_id() AND digitization_private_access(digitization_id));
CREATE TRIGGER engine_guard BEFORE INSERT OR UPDATE ON stage_attempts FOR EACH ROW EXECUTE FUNCTION digitization_row_guard();
CREATE INDEX stage_attempts_engine ON stage_attempts(digitization_id);
ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_read ON artifacts FOR SELECT USING(digitization_private_access(digitization_id));
CREATE POLICY engine_create ON artifacts FOR INSERT WITH CHECK(created_by=actor_id() AND digitization_private_access(digitization_id) AND status='private' AND privacy_status='pending');
CREATE TRIGGER engine_guard BEFORE INSERT OR UPDATE ON artifacts FOR EACH ROW EXECUTE FUNCTION digitization_row_guard();
CREATE INDEX artifacts_engine ON artifacts(digitization_id);
ALTER TABLE tour_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_read ON tour_revisions FOR SELECT USING(digitization_private_access(digitization_id));
CREATE POLICY engine_create ON tour_revisions FOR INSERT WITH CHECK(created_by=actor_id() AND digitization_private_access(digitization_id));
CREATE TRIGGER engine_guard BEFORE INSERT OR UPDATE ON tour_revisions FOR EACH ROW EXECUTE FUNCTION digitization_row_guard();
CREATE INDEX tour_revisions_engine ON tour_revisions(digitization_id);
ALTER TABLE approval_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_read ON approval_records FOR SELECT USING(digitization_private_access(digitization_id));
CREATE TRIGGER engine_guard BEFORE INSERT OR UPDATE ON approval_records FOR EACH ROW EXECUTE FUNCTION digitization_row_guard();
CREATE INDEX approval_records_engine ON approval_records(digitization_id);
ALTER TABLE published_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_read ON published_packages FOR SELECT USING(digitization_private_access(digitization_id));
CREATE TRIGGER engine_guard BEFORE INSERT OR UPDATE ON published_packages FOR EACH ROW EXECUTE FUNCTION digitization_row_guard();
CREATE INDEX published_packages_engine ON published_packages(digitization_id);
ALTER TABLE digitization_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_read ON digitization_events FOR SELECT USING(digitization_private_access(digitization_id));
CREATE POLICY engine_create ON digitization_events FOR INSERT WITH CHECK(created_by=actor_id() AND digitization_private_access(digitization_id));
CREATE TRIGGER engine_guard BEFORE INSERT OR UPDATE ON digitization_events FOR EACH ROW EXECUTE FUNCTION digitization_row_guard();
CREATE INDEX digitization_events_engine ON digitization_events(digitization_id);
-- No publication write policy or administrator bypass. Reviewed guarded ports come in HE-J.
CREATE INDEX processing_stage_reconcile ON processing_stages(state,lease_until);
CREATE INDEX digitization_event_resume ON digitization_events(digitization_id,sequence);
CREATE INDEX digitization_grant_expiry ON digitization_evidence_grants(digitization_id,grantee_id,expires_at) WHERE state='active';
