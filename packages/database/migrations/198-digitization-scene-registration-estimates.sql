-- Observed registrations are private immutable estimates. No measurement or
-- navigation approval is granted by this table or by a low fitting residual.
CREATE TABLE digitization_scene_registrations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),digitization_id uuid NOT NULL REFERENCES property_digitizations,
 organization_id uuid NOT NULL REFERENCES organizations,created_by uuid NOT NULL REFERENCES profiles,
 created_at timestamptz NOT NULL DEFAULT now(),workspace_version integer NOT NULL CHECK(workspace_version>0),
 input_revision integer NOT NULL,scene_artifact_id uuid NOT NULL,geometry_revision_id uuid NOT NULL,floor_id text NOT NULL CHECK(length(floor_id) BETWEEN 1 AND 80),
 anchors jsonb NOT NULL CHECK(jsonb_typeof(anchors)='array' AND jsonb_array_length(anchors) BETWEEN 3 AND 20),
 metres_per_scene_unit NUMERIC(20,8) NOT NULL CHECK(metres_per_scene_unit BETWEEN .000001 AND 1000000),
 registration jsonb NOT NULL CHECK(jsonb_typeof(registration)='object'),note text NOT NULL CHECK(length(note) BETWEEN 5 AND 500),
 FOREIGN KEY(digitization_id,input_revision) REFERENCES property_input_revisions(digitization_id,revision),
 FOREIGN KEY(scene_artifact_id,digitization_id) REFERENCES artifacts(id,digitization_id),
 FOREIGN KEY(geometry_revision_id,digitization_id) REFERENCES geometry_revisions(id,digitization_id)
);
CREATE INDEX digitization_scene_registration_current ON digitization_scene_registrations(digitization_id,input_revision,created_at);
ALTER TABLE digitization_scene_registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY scene_registration_read ON digitization_scene_registrations FOR SELECT USING(digitization_revision_access(digitization_id,input_revision,'preview'));
CREATE POLICY scene_registration_create ON digitization_scene_registrations FOR INSERT WITH CHECK(created_by=actor_id() AND organization_id=org_id() AND digitization_revision_access(digitization_id,input_revision,'document_processing'));
CREATE FUNCTION digitization_scene_registration_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE workspace property_digitizations;geometry geometry_revisions;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Scene registration estimates are immutable' USING ERRCODE='23514';END IF;
 SELECT * INTO workspace FROM property_digitizations WHERE id=NEW.digitization_id FOR UPDATE;
 SELECT * INTO geometry FROM geometry_revisions WHERE digitization_id=NEW.digitization_id ORDER BY revision DESC LIMIT 1;
 IF workspace.id IS NULL OR workspace.state<>'active' OR workspace.organization_id<>NEW.organization_id OR workspace.version<>NEW.workspace_version OR workspace.current_input_revision<>NEW.input_revision OR NEW.created_by<>actor_id() OR NOT digitization_revision_access(NEW.digitization_id,NEW.input_revision,'document_processing') THEN RAISE EXCEPTION 'Current scoped workspace, actor and version required' USING ERRCODE='42501';END IF;
 IF geometry.id IS DISTINCT FROM NEW.geometry_revision_id OR geometry.input_revision IS DISTINCT FROM NEW.input_revision OR geometry.geometry->>'unit'<>'m' OR geometry.scale_status NOT IN('estimated','measured') OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(geometry.geometry->'floors') floor WHERE floor->>'id'=NEW.floor_id) OR NOT EXISTS(SELECT 1 FROM artifacts ar JOIN processing_stages s ON s.id=ar.stage_id WHERE ar.id=NEW.scene_artifact_id AND ar.digitization_id=NEW.digitization_id AND ar.input_revision=NEW.input_revision AND ar.status='private' AND ar.quality_report->>'kind'='splat_scene' AND ar.format IN('application/x-ply','application/octet-stream') AND s.state='succeeded' AND s.stage_type IN('splat_train','scene_export')) THEN RAISE EXCEPTION 'Current private scene and metric plan required' USING ERRCODE='23514';END IF;
 IF NEW.registration->>'scaleStatus' IS DISTINCT FROM 'estimated' OR NEW.registration->>'reviewStatus' IS DISTINCT FROM 'pending' OR NEW.registration->>'metricMeasurementsAvailable' IS DISTINCT FROM 'false' OR NEW.registration->>'planNavigationAvailable' IS DISTINCT FROM 'false' OR NEW.registration->>'publiclyServed' IS DISTINCT FROM 'false' OR (NEW.registration->>'metresPerSceneUnit')::NUMERIC IS DISTINCT FROM NEW.metres_per_scene_unit OR jsonb_typeof(NEW.registration->'sceneToPlan') IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.registration->'sceneToPlan')<>16 THEN RAISE EXCEPTION 'Pending estimate cannot grant metric measurements, navigation or publication' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER digitization_scene_registration_guard BEFORE INSERT OR UPDATE OR DELETE ON digitization_scene_registrations FOR EACH ROW EXECUTE FUNCTION digitization_scene_registration_guard();
