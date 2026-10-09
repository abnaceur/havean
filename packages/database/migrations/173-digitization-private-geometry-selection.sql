ALTER TABLE geometry_revisions ADD COLUMN input_revision integer,
 ADD COLUMN source_artifact_id uuid,
 ADD COLUMN source_selection jsonb,
 ADD CONSTRAINT geometry_input_revision FOREIGN KEY(digitization_id,input_revision) REFERENCES property_input_revisions(digitization_id,revision),
 ADD CONSTRAINT geometry_source_artifact FOREIGN KEY(source_artifact_id,digitization_id) REFERENCES artifacts(id,digitization_id),
 ADD CONSTRAINT geometry_selection_shape CHECK(
  (input_revision IS NULL AND source_artifact_id IS NULL AND source_selection IS NULL) OR
  (input_revision IS NOT NULL AND source_artifact_id IS NOT NULL AND source_selection IS NOT NULL AND jsonb_typeof(source_selection)='object'));
DROP POLICY engine_read ON geometry_revisions;
CREATE POLICY engine_read ON geometry_revisions FOR SELECT USING(
 CASE WHEN input_revision IS NULL THEN digitization_private_access(digitization_id)
 ELSE digitization_revision_access(digitization_id,input_revision,'preview') END);
DROP POLICY engine_create ON geometry_revisions;
CREATE POLICY engine_create ON geometry_revisions FOR INSERT WITH CHECK(created_by=actor_id() AND
 CASE WHEN input_revision IS NULL THEN digitization_private_access(digitization_id)
 ELSE digitization_revision_access(digitization_id,input_revision,'document_processing') END);
CREATE FUNCTION digitization_geometry_selection_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.input_revision IS NOT NULL THEN
  IF NEW.geometry->>'id' IS DISTINCT FROM NEW.id::text OR
   NEW.geometry->>'organizationId' IS DISTINCT FROM NEW.organization_id::text OR
   NEW.geometry->>'targetId' IS DISTINCT FROM (SELECT target_id::text FROM property_digitizations WHERE id=NEW.digitization_id) OR
   (NEW.geometry->>'revision')::integer IS DISTINCT FROM NEW.revision OR
   NOT EXISTS(SELECT 1 FROM artifacts a JOIN processing_stages s ON s.id=a.stage_id WHERE a.id=NEW.source_artifact_id AND a.digitization_id=NEW.digitization_id AND a.input_revision=NEW.input_revision AND a.format='image/png' AND a.status='private' AND s.state='succeeded' AND s.stage_type='document_rasterize') THEN
   RAISE EXCEPTION 'Current scoped private geometry source and identity required' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER geometry_selection_guard BEFORE INSERT ON geometry_revisions FOR EACH ROW EXECUTE FUNCTION digitization_geometry_selection_guard();
