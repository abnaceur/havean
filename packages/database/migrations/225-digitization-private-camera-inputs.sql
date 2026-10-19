-- API-prepared, immutable archive descriptors. Original clips remain the scope
-- and retention authority; no uploaded archive becomes a trusted source.
CREATE TABLE digitization_camera_inputs(
 stage_id uuid PRIMARY KEY REFERENCES processing_stages,
 digitization_id uuid NOT NULL REFERENCES property_digitizations,
 organization_id uuid NOT NULL REFERENCES organizations,created_by uuid NOT NULL REFERENCES profiles,
 input_revision int NOT NULL,workspace_version int NOT NULL CHECK(workspace_version>0),
 recipe_id uuid NOT NULL REFERENCES digitization_frame_privacy_recipes,
 source jsonb NOT NULL CHECK(jsonb_typeof(source)='object' AND octet_length(source::text)<4096),
 manifest_sha256 text NOT NULL CHECK(manifest_sha256~'^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(stage_id,digitization_id) REFERENCES processing_stages(id,digitization_id),
 FOREIGN KEY(digitization_id,input_revision) REFERENCES property_input_revisions(digitization_id,revision)
);
ALTER TABLE digitization_camera_inputs ENABLE ROW LEVEL SECURITY;
CREATE POLICY camera_input_read ON digitization_camera_inputs FOR SELECT USING(digitization_revision_access(digitization_id,input_revision,'preview'));
CREATE POLICY camera_input_create ON digitization_camera_inputs FOR INSERT WITH CHECK(created_by=actor_id() AND organization_id=org_id() AND digitization_revision_access(digitization_id,input_revision,'document_processing'));
CREATE FUNCTION digitization_camera_input_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE workspace property_digitizations;stage processing_stages;recipe digitization_frame_privacy_recipes;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Prepared camera inputs are immutable' USING ERRCODE='23514';END IF;
 SELECT * INTO workspace FROM property_digitizations WHERE id=NEW.digitization_id FOR UPDATE;
 SELECT * INTO stage FROM processing_stages WHERE id=NEW.stage_id;
 SELECT * INTO recipe FROM digitization_frame_privacy_recipes WHERE id=NEW.recipe_id;
 IF workspace.id IS NULL OR stage.id IS NULL OR recipe.id IS NULL OR workspace.state<>'active' OR workspace.version<>NEW.workspace_version OR workspace.current_input_revision<>NEW.input_revision OR workspace.organization_id IS DISTINCT FROM NEW.organization_id OR NEW.organization_id IS DISTINCT FROM org_id() OR NEW.created_by IS DISTINCT FROM actor_id() OR stage.created_by IS DISTINCT FROM actor_id() OR stage.digitization_id<>workspace.id OR stage.input_revision<>NEW.input_revision OR stage.state<>'pending' OR stage.stage_type<>'camera_solve' OR stage.profile_id<>'private-colmap-cpu-investigation-v1' OR recipe.digitization_id<>workspace.id OR recipe.input_revision<>NEW.input_revision OR NOT digitization_revision_access(workspace.id,NEW.input_revision,'document_processing') THEN RAISE EXCEPTION 'Current private camera scope required' USING ERRCODE='42501';END IF;
 IF NEW.source->>'detectedMime' IS DISTINCT FROM 'application/x-tar' OR NEW.source->>'purpose' IS DISTINCT FROM 'video' OR NEW.source->>'decoderState' IS DISTINCT FROM 'private_frames_prepared' OR NOT coalesce(NEW.source->>'sha256'~'^[a-f0-9]{64}$',false) OR NOT coalesce(NEW.source->>'bytes'~'^[1-9][0-9]{0,8}$',false) OR (NEW.source->>'bytes')::bigint>33554432 OR NOT EXISTS(SELECT 1 FROM property_input_revisions r CROSS JOIN LATERAL jsonb_array_elements(r.source_set) s WHERE r.digitization_id=workspace.id AND r.revision=NEW.input_revision AND s->>'assetId'=NEW.source->>'assetId' AND s->>'assetVersion'=NEW.source->>'assetVersion' AND s->>'purpose'='video') THEN RAISE EXCEPTION 'Bounded prepared archive and original clip scope required' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER camera_input_guard BEFORE INSERT OR UPDATE OR DELETE ON digitization_camera_inputs FOR EACH ROW EXECUTE FUNCTION digitization_camera_input_guard();
-- Stop/purge descriptors remain available after evidence revocation or erasure.
-- This capability returns no source bytes, object key or read capability.
CREATE FUNCTION digitization_camera_stop_input(engine_ref uuid,stage_ref uuid,execution_ref uuid,fence_ref text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT input.source FROM digitization_camera_inputs input JOIN processing_stages stage ON stage.id=input.stage_id JOIN processing_runs run ON run.id=stage.run_id
 WHERE input.digitization_id=engine_ref AND stage.id=stage_ref AND stage.execution_id=execution_ref AND stage.fencing_token::text=fence_ref
 AND ((run.created_by=actor_id() AND digitization_target_access(engine_ref) AND run.state IN('cancel_requested','cancelled'))
 OR (actor_id()='00000000-0000-4000-8000-000000000010'::uuid AND EXISTS(SELECT 1 FROM digitization_deletion_jobs job WHERE job.kind='stop_run' AND job.run_id=run.id AND job.state='pending')))
$$;
REVOKE ALL ON FUNCTION digitization_camera_stop_input(uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION digitization_camera_stop_input(uuid,uuid,uuid,text) TO haven_app;
