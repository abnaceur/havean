-- Bound a complete high-resolution multi-room capture while retaining all lineage guards.
CREATE OR REPLACE FUNCTION digitization_camera_input_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE workspace property_digitizations;stage processing_stages;recipe digitization_frame_privacy_recipes;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Prepared camera inputs are immutable' USING ERRCODE='23514';END IF;
 SELECT * INTO workspace FROM property_digitizations WHERE id=NEW.digitization_id FOR UPDATE;
 SELECT * INTO stage FROM processing_stages WHERE id=NEW.stage_id;
 SELECT * INTO recipe FROM digitization_frame_privacy_recipes WHERE id=NEW.recipe_id;
 IF workspace.id IS NULL OR stage.id IS NULL OR recipe.id IS NULL OR workspace.state<>'active' OR workspace.version<>NEW.workspace_version OR workspace.current_input_revision<>NEW.input_revision OR workspace.organization_id IS DISTINCT FROM NEW.organization_id OR NEW.organization_id IS DISTINCT FROM org_id() OR NEW.created_by IS DISTINCT FROM actor_id() OR stage.created_by IS DISTINCT FROM actor_id() OR stage.digitization_id<>workspace.id OR stage.input_revision<>NEW.input_revision OR stage.state<>'pending' OR stage.stage_type<>'camera_solve' OR stage.profile_id<>'private-colmap-cpu-investigation-v1' OR recipe.digitization_id<>workspace.id OR recipe.input_revision<>NEW.input_revision OR NOT digitization_revision_access(workspace.id,NEW.input_revision,'document_processing') THEN RAISE EXCEPTION 'Current private camera scope required' USING ERRCODE='42501';END IF;
 IF NEW.source->>'detectedMime' IS DISTINCT FROM 'application/x-tar' OR NEW.source->>'purpose' IS DISTINCT FROM 'video' OR NEW.source->>'decoderState' IS DISTINCT FROM 'private_frames_prepared' OR NOT coalesce(NEW.source->>'sha256'~'^[a-f0-9]{64}$',false) OR NOT coalesce(NEW.source->>'bytes'~'^[1-9][0-9]{0,8}$',false) OR (NEW.source->>'bytes')::bigint>402653184 OR NOT EXISTS(SELECT 1 FROM property_input_revisions r CROSS JOIN LATERAL jsonb_array_elements(r.source_set) s WHERE r.digitization_id=workspace.id AND r.revision=NEW.input_revision AND s->>'assetId'=NEW.source->>'assetId' AND s->>'assetVersion'=NEW.source->>'assetVersion' AND s->>'purpose' IN('video','photo')) THEN RAISE EXCEPTION 'Bounded prepared archive and original photo or clip scope required' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
