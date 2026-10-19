-- Durable user-supplied masks/exclusions; no public/privacy approval is created.
CREATE TABLE digitization_frame_privacy_recipes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),digitization_id uuid NOT NULL REFERENCES property_digitizations,organization_id uuid NOT NULL REFERENCES organizations,created_by uuid NOT NULL REFERENCES profiles,
 version int NOT NULL DEFAULT 1 CHECK(version=1),input_revision int NOT NULL,workspace_version int NOT NULL CHECK(workspace_version>0),dataset_id uuid NOT NULL REFERENCES digitization_frame_datasets,
 recipe jsonb NOT NULL CHECK(jsonb_typeof(recipe)='object' AND octet_length(recipe::text)<=1048576),recipe_fingerprint text NOT NULL CHECK(recipe_fingerprint ~ '^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(digitization_id,input_revision) REFERENCES property_input_revisions(digitization_id,revision)
);
ALTER TABLE digitization_frame_privacy_recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY frame_privacy_read ON digitization_frame_privacy_recipes FOR SELECT USING(digitization_revision_access(digitization_id,input_revision,'preview'));
CREATE POLICY frame_privacy_create ON digitization_frame_privacy_recipes FOR INSERT WITH CHECK(created_by=actor_id() AND organization_id=org_id() AND digitization_revision_access(digitization_id,input_revision,'document_processing'));
CREATE FUNCTION digitization_frame_privacy_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE workspace property_digitizations;dataset digitization_frame_datasets;item jsonb;box jsonb;frame jsonb;n int;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Privacy recipes are immutable private snapshots' USING ERRCODE='23514';END IF;
 SELECT * INTO workspace FROM property_digitizations WHERE id=NEW.digitization_id FOR UPDATE;
 SELECT * INTO dataset FROM digitization_frame_datasets WHERE id=NEW.dataset_id;
 IF workspace.id IS NULL OR dataset.id IS NULL OR workspace.state<>'active' OR NEW.organization_id IS DISTINCT FROM workspace.organization_id OR NEW.organization_id IS DISTINCT FROM org_id() OR NEW.created_by<>actor_id() OR NEW.workspace_version<>workspace.version OR NEW.input_revision<>workspace.current_input_revision OR dataset.digitization_id<>NEW.digitization_id OR dataset.input_revision<>NEW.input_revision OR NOT digitization_revision_access(NEW.digitization_id,NEW.input_revision,'document_processing') OR NOT EXISTS(SELECT 1 FROM profiles p JOIN memberships m ON m.user_id=p.id JOIN organizations o ON o.id=m.organization_id WHERE p.id=actor_id() AND p.state='active' AND m.status='active' AND m.organization_id=NEW.organization_id AND m.role IN('agent','agency_manager') AND o.type='agency') THEN RAISE EXCEPTION 'Current actor, dataset and workspace source scope required' USING ERRCODE='42501';END IF;
 IF NEW.recipe->>'schemaVersion' IS DISTINCT FROM '1' OR NEW.recipe->>'datasetId' IS DISTINCT FROM NEW.dataset_id::text OR NEW.recipe->>'datasetVersion' IS DISTINCT FROM '1' OR NEW.recipe->>'inspectionConfirmed' IS DISTINCT FROM 'true' OR jsonb_typeof(NEW.recipe->'excludedFrameIds') IS DISTINCT FROM 'array' OR jsonb_typeof(NEW.recipe->'masks') IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.recipe->'excludedFrameIds')>600 OR jsonb_array_length(NEW.recipe->'masks')>600 OR NEW.recipe_fingerprint IS DISTINCT FROM encode(sha256(convert_to(NEW.recipe::text,'UTF8')),'hex') THEN RAISE EXCEPTION 'Explicit bounded immutable privacy recipe required' USING ERRCODE='23514';END IF;
 SELECT count(DISTINCT id) INTO n FROM jsonb_array_elements_text(NEW.recipe->'excludedFrameIds') id;
 IF n<>jsonb_array_length(NEW.recipe->'excludedFrameIds') OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(NEW.recipe->'excludedFrameIds') id WHERE NOT(dataset.report->'selectedArtifactIds' @> jsonb_build_array(id.value))) THEN RAISE EXCEPTION 'Exclude distinct selected source frames only' USING ERRCODE='23514';END IF;
 SELECT count(DISTINCT item->>'artifactId') INTO n FROM jsonb_array_elements(NEW.recipe->'masks') item;
 IF n<>jsonb_array_length(NEW.recipe->'masks') THEN RAISE EXCEPTION 'Mask each selected source frame once' USING ERRCODE='23514';END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(NEW.recipe->'masks') LOOP
  SELECT f INTO frame FROM jsonb_array_elements(dataset.frames) f WHERE f->>'artifactId'=item->>'artifactId';
  IF frame IS NULL OR NOT(dataset.report->'selectedArtifactIds' @> jsonb_build_array(item->>'artifactId')) OR NEW.recipe->'excludedFrameIds' @> jsonb_build_array(item->>'artifactId') OR jsonb_typeof(item->'regions') IS DISTINCT FROM 'array' OR jsonb_array_length(item->'regions') NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Mask only selected nonexcluded decoded frames' USING ERRCODE='23514';END IF;
  FOR box IN SELECT * FROM jsonb_array_elements(item->'regions') LOOP
   IF NOT coalesce(((box->>'x') ~ '^[0-9]{1,3}$' AND (box->>'y') ~ '^[0-9]{1,3}$' AND (box->>'width') ~ '^[1-9][0-9]{0,2}$' AND (box->>'height') ~ '^[1-9][0-9]{0,2}$'),false) OR (box->>'x')::int+(box->>'width')::int>(frame#>>'{quality,width}')::int OR (box->>'y')::int+(box->>'height')::int>(frame#>>'{quality,height}')::int THEN RAISE EXCEPTION 'Mask rectangles must fit actual upright source pixels' USING ERRCODE='23514';END IF;
  END LOOP;
 END LOOP;
 FOR frame IN SELECT * FROM jsonb_array_elements(dataset.frames) LOOP
  IF NOT EXISTS(SELECT 1 FROM artifacts a JOIN processing_stages s ON s.id=a.stage_id JOIN processing_runs r ON r.id=s.run_id WHERE a.id=(frame->>'artifactId')::uuid AND a.version=(frame->>'artifactVersion')::int AND a.checksum=frame#>>'{quality,sha256}' AND a.quality_report->>'width'=frame#>>'{quality,width}' AND a.quality_report->>'height'=frame#>>'{quality,height}' AND a.digitization_id=NEW.digitization_id AND a.input_revision=NEW.input_revision AND a.status='private' AND a.privacy_status IN('pending','passed') AND a.format='image/png' AND a.profile_id='private-media-frames-v1' AND s.state='succeeded' AND s.stage_type='frame_select' AND r.state IN('awaiting_review','awaiting_input','failed','partially_ready')) THEN RAISE EXCEPTION 'Current native source-frame versions and checksums required' USING ERRCODE='23514';END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER frame_privacy_guard BEFORE INSERT OR UPDATE OR DELETE ON digitization_frame_privacy_recipes FOR EACH ROW EXECUTE FUNCTION digitization_frame_privacy_guard();
CREATE INDEX frame_privacy_engine ON digitization_frame_privacy_recipes(digitization_id,created_at DESC);
