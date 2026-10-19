CREATE TABLE digitization_frame_datasets(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),digitization_id uuid NOT NULL REFERENCES property_digitizations,
 organization_id uuid NOT NULL REFERENCES organizations,created_by uuid NOT NULL REFERENCES profiles,
 version integer NOT NULL DEFAULT 1 CHECK(version=1),created_at timestamptz NOT NULL DEFAULT now(),
 workspace_version integer NOT NULL CHECK(workspace_version>0),input_revision integer NOT NULL,
 frames jsonb NOT NULL CHECK(jsonb_typeof(frames)='array' AND jsonb_array_length(frames) BETWEEN 1 AND 600),
 report jsonb NOT NULL CHECK(jsonb_typeof(report)='object' AND octet_length(report::text)<=1048576),
 FOREIGN KEY(digitization_id,input_revision) REFERENCES property_input_revisions(digitization_id,revision)
);
ALTER TABLE digitization_frame_datasets ENABLE ROW LEVEL SECURITY;
CREATE POLICY frame_dataset_read ON digitization_frame_datasets FOR SELECT USING(digitization_revision_access(digitization_id,input_revision,'preview'));
CREATE POLICY frame_dataset_create ON digitization_frame_datasets FOR INSERT WITH CHECK(created_by=actor_id() AND digitization_revision_access(digitization_id,input_revision,'document_processing'));
CREATE FUNCTION digitization_frame_dataset_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE workspace property_digitizations;ref record;n integer;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Frame datasets are immutable private snapshots' USING ERRCODE='23514';END IF;
 SELECT * INTO workspace FROM property_digitizations WHERE id=NEW.digitization_id FOR UPDATE;
 IF workspace.id IS NULL OR workspace.state<>'active' OR NEW.organization_id<>workspace.organization_id OR NEW.created_by<>actor_id() OR NEW.version<>1 OR NEW.workspace_version<>workspace.version OR NEW.input_revision<>workspace.current_input_revision OR NOT digitization_revision_access(NEW.digitization_id,NEW.input_revision,'document_processing') OR NOT EXISTS(SELECT 1 FROM memberships m JOIN profiles p ON p.id=m.user_id AND p.state='active' JOIN organizations o ON o.id=m.organization_id AND o.type='agency' WHERE m.user_id=actor_id() AND m.organization_id=NEW.organization_id AND m.status='active' AND m.role IN('agent','agency_manager')) THEN RAISE EXCEPTION 'Current actor, source revision and workspace version required' USING ERRCODE='42501';END IF;
 IF NEW.report->>'reviewRequired' IS DISTINCT FROM 'true' OR NEW.report->'geometricCoverage' IS DISTINCT FROM 'null'::jsonb OR NEW.report#>>'{profile,id}' IS DISTINCT FROM 'private-frame-quality-v1' OR NEW.report->>'sourceFrameCount' IS DISTINCT FROM jsonb_array_length(NEW.frames)::text THEN RAISE EXCEPTION 'Private advisory frame report required' USING ERRCODE='23514';END IF;
 SELECT count(DISTINCT value->>'artifactId') INTO n FROM jsonb_array_elements(NEW.frames);
 IF n<>jsonb_array_length(NEW.frames) THEN RAISE EXCEPTION 'Distinct frame lineage required' USING ERRCODE='23514';END IF;
 FOR ref IN SELECT * FROM jsonb_to_recordset(NEW.frames) AS f("artifactId" uuid,"artifactVersion" integer) LOOP
  IF NOT EXISTS(SELECT 1 FROM artifacts a JOIN processing_stages s ON s.id=a.stage_id JOIN processing_runs r ON r.id=s.run_id WHERE a.id=ref."artifactId" AND a.version=ref."artifactVersion" AND a.digitization_id=NEW.digitization_id AND a.input_revision=NEW.input_revision AND a.status='private' AND a.privacy_status IN('pending','passed') AND a.format='image/png' AND a.profile_id='private-media-frames-v1' AND a.quality_report->>'kind'='video_frame' AND s.stage_type='frame_select' AND s.state='succeeded' AND r.state IN('awaiting_review','awaiting_input','failed','partially_ready')) THEN RAISE EXCEPTION 'Current private decoded frame lineage required' USING ERRCODE='23514';END IF;
 END LOOP;
 IF jsonb_typeof(NEW.report->'selectedArtifactIds') IS DISTINCT FROM 'array' OR jsonb_typeof(NEW.report->'decisions') IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.report->'decisions')<>n OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(NEW.report->'selectedArtifactIds') selected WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.frames) f WHERE f->>'artifactId'=selected.value)) THEN RAISE EXCEPTION 'Report selections must belong to exact frame lineage' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER frame_dataset_guard BEFORE INSERT OR UPDATE OR DELETE ON digitization_frame_datasets FOR EACH ROW EXECUTE FUNCTION digitization_frame_dataset_guard();
CREATE INDEX digitization_frame_datasets_engine ON digitization_frame_datasets(digitization_id,created_at DESC);
