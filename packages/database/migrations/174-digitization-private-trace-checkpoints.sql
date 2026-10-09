CREATE TABLE digitization_trace_checkpoints(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),digitization_id uuid NOT NULL REFERENCES property_digitizations,
 organization_id uuid NOT NULL REFERENCES organizations,created_by uuid NOT NULL REFERENCES profiles,
 version integer NOT NULL DEFAULT 1 CHECK(version=1),base_workspace_version integer NOT NULL CHECK(base_workspace_version>0),
 input_revision integer NOT NULL,source_artifact_id uuid NOT NULL,clockwise_degrees numeric NOT NULL CHECK(clockwise_degrees BETWEEN -180 AND 180),
 geometry jsonb NOT NULL CHECK(jsonb_typeof(geometry)='object' AND octet_length(geometry::text)<=524288),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(digitization_id,input_revision) REFERENCES property_input_revisions(digitization_id,revision),
 FOREIGN KEY(source_artifact_id,digitization_id) REFERENCES artifacts(id,digitization_id)
);
CREATE INDEX trace_checkpoint_actor_latest ON digitization_trace_checkpoints(digitization_id,created_by,created_at DESC);
ALTER TABLE digitization_trace_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE digitization_trace_checkpoints FORCE ROW LEVEL SECURITY;
CREATE POLICY checkpoint_read ON digitization_trace_checkpoints FOR SELECT USING(created_by=actor_id() AND organization_id=org_id() AND digitization_revision_access(digitization_id,input_revision,'preview'));
CREATE POLICY checkpoint_create ON digitization_trace_checkpoints FOR INSERT WITH CHECK(created_by=actor_id() AND organization_id=org_id() AND digitization_revision_access(digitization_id,input_revision,'document_processing'));
CREATE FUNCTION digitization_checkpoint_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Private trace checkpoints are immutable' USING ERRCODE='42501';END IF;
 IF NEW.geometry->>'organizationId' IS DISTINCT FROM NEW.organization_id::text OR NEW.geometry->>'unit'<>'px' OR NEW.geometry->>'scaleStatus'<>'unscaled' OR
 NOT EXISTS(SELECT 1 FROM property_digitizations d WHERE d.id=NEW.digitization_id AND d.organization_id=NEW.organization_id AND d.state='active' AND d.version=NEW.base_workspace_version AND d.current_input_revision=NEW.input_revision AND NEW.geometry->>'targetId'=d.target_id::text) OR
 NOT EXISTS(SELECT 1 FROM artifacts a JOIN processing_stages s ON s.id=a.stage_id WHERE a.id=NEW.source_artifact_id AND a.digitization_id=NEW.digitization_id AND a.input_revision=NEW.input_revision AND a.status='private' AND a.format='image/png' AND s.state='succeeded' AND s.stage_type='document_rasterize') THEN
 RAISE EXCEPTION 'Current scoped checkpoint actor/source/version/state required' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trace_checkpoint_guard BEFORE INSERT OR UPDATE OR DELETE ON digitization_trace_checkpoints FOR EACH ROW EXECUTE FUNCTION digitization_checkpoint_guard();
