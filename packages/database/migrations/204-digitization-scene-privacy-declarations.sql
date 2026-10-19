-- Private author declarations do not confer independent review or publication.
CREATE TABLE digitization_scene_privacy_declarations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),digitization_id uuid NOT NULL REFERENCES property_digitizations,
 organization_id uuid NOT NULL REFERENCES organizations,created_by uuid NOT NULL REFERENCES profiles,
 created_at timestamptz NOT NULL DEFAULT now(),workspace_version integer NOT NULL CHECK(workspace_version>0),
 input_revision integer NOT NULL,artifact_id uuid NOT NULL,artifact_version integer NOT NULL CHECK(artifact_version>0),
 artifact_checksum text NOT NULL CHECK(artifact_checksum ~ '^[a-f0-9]{64}$'),geometry_revision_id uuid,
 coverage jsonb NOT NULL CHECK(jsonb_typeof(coverage)='array' AND jsonb_array_length(coverage)<=200),
 inspection text NOT NULL CHECK(inspection IN('not_inspected','issues_found','ready_for_independent_review')),
 note text NOT NULL CHECK(length(note) BETWEEN 5 AND 500),
 FOREIGN KEY(digitization_id,input_revision) REFERENCES property_input_revisions(digitization_id,revision),
 FOREIGN KEY(artifact_id,digitization_id) REFERENCES artifacts(id,digitization_id),
 FOREIGN KEY(geometry_revision_id,digitization_id) REFERENCES geometry_revisions(id,digitization_id)
);
CREATE INDEX scene_privacy_declaration_current ON digitization_scene_privacy_declarations(digitization_id,input_revision,created_at);
ALTER TABLE digitization_scene_privacy_declarations ENABLE ROW LEVEL SECURITY;
CREATE POLICY scene_privacy_read ON digitization_scene_privacy_declarations FOR SELECT USING(digitization_revision_access(digitization_id,input_revision,'preview'));
CREATE POLICY scene_privacy_create ON digitization_scene_privacy_declarations FOR INSERT WITH CHECK(created_by=actor_id() AND organization_id=org_id() AND digitization_revision_access(digitization_id,input_revision,'document_processing'));
CREATE FUNCTION digitization_scene_privacy_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE workspace property_digitizations;geometry geometry_revisions;rooms jsonb;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Scene privacy declarations are immutable' USING ERRCODE='23514';END IF;
 SELECT * INTO workspace FROM property_digitizations WHERE id=NEW.digitization_id FOR UPDATE;
 IF workspace.id IS NULL OR workspace.state<>'active' OR workspace.organization_id<>NEW.organization_id OR workspace.version<>NEW.workspace_version OR workspace.current_input_revision<>NEW.input_revision OR NEW.created_by<>actor_id() OR NOT digitization_revision_access(NEW.digitization_id,NEW.input_revision,'document_processing') THEN RAISE EXCEPTION 'Current scoped actor, source, version and workflow required' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM artifacts ar JOIN processing_stages s ON s.id=ar.stage_id WHERE ar.id=NEW.artifact_id AND ar.digitization_id=NEW.digitization_id AND ar.input_revision=NEW.input_revision AND ar.version=NEW.artifact_version AND ar.checksum=NEW.artifact_checksum AND ar.status='private' AND ar.format='application/octet-stream' AND ar.quality_report->>'kind'='splat_viewer_tier' AND ar.quality_report->>'encoding'='splat32-wxyz-v1' AND s.state='succeeded' AND s.stage_type='scene_export') THEN RAISE EXCEPTION 'Current validated private scene required' USING ERRCODE='23514';END IF;
 SELECT * INTO geometry FROM geometry_revisions WHERE digitization_id=NEW.digitization_id ORDER BY revision DESC LIMIT 1;
 IF geometry.input_revision IS DISTINCT FROM NEW.input_revision THEN geometry.id:=NULL;END IF;
 IF geometry.id IS DISTINCT FROM NEW.geometry_revision_id THEN RAISE EXCEPTION 'Current source-linked geometry required' USING ERRCODE='23514';END IF;
 rooms:=CASE WHEN geometry.id IS NULL THEN '[]'::jsonb ELSE geometry.geometry->'rooms' END;
 IF jsonb_array_length(NEW.coverage)<>jsonb_array_length(rooms) OR (SELECT count(DISTINCT room->>'roomId') FROM jsonb_array_elements(NEW.coverage) room)<>jsonb_array_length(NEW.coverage) OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.coverage) room WHERE room->>'status' NOT IN('covered','partial','excluded','unknown') OR room->>'status' IS NULL OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(rooms) planroom WHERE planroom->>'id'=room->>'roomId')) THEN RAISE EXCEPTION 'Every plan room needs explicit coverage, including unknown rooms' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER digitization_scene_privacy_guard BEFORE INSERT OR UPDATE OR DELETE ON digitization_scene_privacy_declarations FOR EACH ROW EXECUTE FUNCTION digitization_scene_privacy_guard();
