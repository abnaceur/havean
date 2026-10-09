ALTER TABLE artifacts ADD COLUMN reused_from_artifact_id uuid,
 ADD CONSTRAINT reused_artifact_scope FOREIGN KEY(reused_from_artifact_id,digitization_id) REFERENCES artifacts(id,digitization_id);
CREATE TABLE digitization_input_changes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),digitization_id uuid NOT NULL REFERENCES property_digitizations,
 organization_id uuid NOT NULL REFERENCES organizations,created_by uuid NOT NULL REFERENCES profiles,version integer NOT NULL DEFAULT 1 CHECK(version=1),
 previous_revision integer NOT NULL CHECK(previous_revision>=0),input_revision integer NOT NULL,
 documents_changed boolean NOT NULL,plans_changed boolean NOT NULL,media_changed boolean NOT NULL,
 domains jsonb NOT NULL CHECK(jsonb_typeof(domains)='object'),created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(digitization_id,input_revision) REFERENCES property_input_revisions(digitization_id,revision),
 CHECK(input_revision=previous_revision+1),UNIQUE(digitization_id,input_revision)
);
CREATE TABLE digitization_approval_invalidations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),digitization_id uuid NOT NULL REFERENCES property_digitizations,
 organization_id uuid NOT NULL REFERENCES organizations,created_by uuid NOT NULL REFERENCES profiles,version integer NOT NULL DEFAULT 1 CHECK(version=1),
 approval_id uuid NOT NULL,input_revision integer NOT NULL,reason text NOT NULL CHECK(reason IN('document_inputs_changed','plan_inputs_changed','media_inputs_changed')),
 created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(approval_id,digitization_id) REFERENCES approval_records(id,digitization_id),
 FOREIGN KEY(digitization_id,input_revision) REFERENCES property_input_revisions(digitization_id,revision),UNIQUE(approval_id,input_revision)
);
ALTER TABLE digitization_input_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE digitization_approval_invalidations ENABLE ROW LEVEL SECURITY;
CREATE POLICY input_change_read ON digitization_input_changes FOR SELECT USING(digitization_target_access(digitization_id));
CREATE POLICY input_change_create ON digitization_input_changes FOR INSERT WITH CHECK(created_by=actor_id() AND organization_id=org_id() AND digitization_target_access(digitization_id));
CREATE POLICY approval_invalidation_read ON digitization_approval_invalidations FOR SELECT USING(digitization_target_access(digitization_id));
CREATE POLICY approval_invalidation_create ON digitization_approval_invalidations FOR INSERT WITH CHECK(created_by=actor_id() AND organization_id=org_id() AND digitization_target_access(digitization_id));
CREATE TRIGGER input_change_guard BEFORE INSERT OR UPDATE ON digitization_input_changes FOR EACH ROW EXECUTE FUNCTION digitization_row_guard();
CREATE TRIGGER approval_invalidation_guard BEFORE INSERT OR UPDATE ON digitization_approval_invalidations FOR EACH ROW EXECUTE FUNCTION digitization_row_guard();
CREATE FUNCTION digitization_approval_current(approval_ref uuid,engine_ref uuid,input_ref integer) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT digitization_target_access(engine_ref) AND EXISTS(SELECT 1 FROM approval_records a WHERE a.id=approval_ref AND a.digitization_id=engine_ref AND a.decision='approved')
 AND NOT EXISTS(SELECT 1 FROM digitization_approval_invalidations i WHERE i.approval_id=approval_ref AND i.digitization_id=engine_ref AND i.input_revision<=input_ref)
$$;
CREATE FUNCTION digitization_package_freshness_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='INSERT' AND (NOT digitization_approval_current(NEW.approval_id,NEW.digitization_id,NEW.input_revision) OR NOT EXISTS(SELECT 1 FROM property_digitizations d WHERE d.id=NEW.digitization_id AND d.current_input_revision=NEW.input_revision)) THEN
 RAISE EXCEPTION 'Current uninvalidated approval is required for a new package' USING ERRCODE='23514';END IF;RETURN NEW;
END $$;
CREATE TRIGGER package_freshness BEFORE INSERT ON published_packages FOR EACH ROW EXECUTE FUNCTION digitization_package_freshness_guard();
