-- Only API-bound calibrated outputs, never user-selected archives or runner paths.
CREATE TABLE digitization_training_inputs(
 stage_id uuid PRIMARY KEY REFERENCES processing_stages,
 export_stage_id uuid UNIQUE NOT NULL REFERENCES processing_stages,
 digitization_id uuid NOT NULL REFERENCES property_digitizations,
 organization_id uuid NOT NULL REFERENCES organizations,created_by uuid NOT NULL REFERENCES profiles,
 input_revision int NOT NULL,workspace_version int NOT NULL CHECK(workspace_version>0),
 camera_report_id uuid NOT NULL REFERENCES artifacts,archive_id uuid NOT NULL REFERENCES artifacts,
 dataset_fingerprint text NOT NULL CHECK(dataset_fingerprint~'^[a-f0-9]{64}$'),
 source jsonb NOT NULL CHECK(jsonb_typeof(source)='object' AND octet_length(source::text)<4096),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(stage_id,digitization_id) REFERENCES processing_stages(id,digitization_id),
 FOREIGN KEY(export_stage_id,digitization_id) REFERENCES processing_stages(id,digitization_id),
 FOREIGN KEY(camera_report_id,digitization_id) REFERENCES artifacts(id,digitization_id),
 FOREIGN KEY(archive_id,digitization_id) REFERENCES artifacts(id,digitization_id),
 FOREIGN KEY(digitization_id,input_revision) REFERENCES property_input_revisions(digitization_id,revision)
);
ALTER TABLE digitization_training_inputs ENABLE ROW LEVEL SECURITY;
CREATE POLICY training_input_read ON digitization_training_inputs FOR SELECT USING(digitization_revision_access(digitization_id,input_revision,'preview'));
CREATE POLICY training_input_create ON digitization_training_inputs FOR INSERT WITH CHECK(created_by=actor_id() AND organization_id=org_id() AND digitization_revision_access(digitization_id,input_revision,'document_processing'));
CREATE FUNCTION digitization_training_input_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE w property_digitizations;s processing_stages;e processing_stages;r artifacts;ar artifacts;camera digitization_camera_inputs;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Prepared training inputs are immutable' USING ERRCODE='23514';END IF;
 SELECT * INTO w FROM property_digitizations WHERE id=NEW.digitization_id FOR UPDATE;
 SELECT * INTO s FROM processing_stages WHERE id=NEW.stage_id;
 SELECT * INTO e FROM processing_stages WHERE id=NEW.export_stage_id;
 SELECT * INTO r FROM artifacts WHERE id=NEW.camera_report_id;
 SELECT * INTO ar FROM artifacts WHERE id=NEW.archive_id;
 SELECT * INTO camera FROM digitization_camera_inputs WHERE stage_id=r.stage_id;
 IF w.id IS NULL OR s.id IS NULL OR e.id IS NULL OR r.id IS NULL OR ar.id IS NULL OR camera.stage_id IS NULL
 OR w.state<>'active' OR w.version<>NEW.workspace_version OR w.current_input_revision<>NEW.input_revision
 OR w.organization_id IS DISTINCT FROM NEW.organization_id OR NEW.organization_id IS DISTINCT FROM org_id() OR NEW.created_by IS DISTINCT FROM actor_id()
 OR s.created_by IS DISTINCT FROM actor_id() OR e.created_by IS DISTINCT FROM actor_id() OR s.run_id<>e.run_id OR s.state<>'pending' OR e.state<>'pending'
 OR s.input_revision<>NEW.input_revision OR e.input_revision<>NEW.input_revision OR s.stage_type<>'splat_train' OR e.stage_type<>'scene_export'
 OR s.profile_id<>'gsplat-1.5.3-cu126-fixed-density-investigation-v1' OR e.profile_id<>'private-gsplat-scene-export-v1'
 OR camera.workspace_version<>NEW.workspace_version OR camera.created_by IS DISTINCT FROM actor_id() OR ar.stage_id<>r.stage_id OR ar.input_revision<>NEW.input_revision OR r.input_revision<>NEW.input_revision
 OR ar.status<>'private' OR r.status<>'private' OR ar.privacy_status='rejected' OR r.privacy_status='rejected'
 OR ar.quality_report->>'kind' IS DISTINCT FROM 'camera_training_archive' OR r.quality_report->>'kind' IS DISTINCT FROM 'camera_solve_report'
 OR ar.format<>'application/x-tar' OR ar.checksum IS DISTINCT FROM r.quality_report#>>'{trainingArchive,sha256}'
 OR NEW.dataset_fingerprint IS DISTINCT FROM r.quality_report#>>'{trainingArchive,datasetFingerprint}'
 OR NEW.source->>'sha256' IS DISTINCT FROM ar.checksum OR NEW.source->>'bytes' IS DISTINCT FROM ar.byte_size::text OR ar.byte_size>104857600
 OR NEW.source->>'detectedMime' IS DISTINCT FROM 'application/x-tar' OR NEW.source->>'purpose' IS DISTINCT FROM 'video'
 OR NEW.source->>'decoderState' IS DISTINCT FROM 'calibrated_training_prepared'
 OR NEW.source->>'assetId' IS DISTINCT FROM camera.source->>'assetId' OR NEW.source->>'assetVersion' IS DISTINCT FROM camera.source->>'assetVersion'
 OR NOT EXISTS(SELECT 1 FROM processing_stages WHERE id=r.stage_id AND state='succeeded')
 OR NOT EXISTS(SELECT 1 FROM processing_stage_dependencies WHERE stage_id=e.id AND dependency_id=s.id)
 OR NOT digitization_revision_access(w.id,NEW.input_revision,'document_processing') THEN RAISE EXCEPTION 'Current calibrated training scope required' USING ERRCODE='42501';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER training_input_guard BEFORE INSERT OR UPDATE OR DELETE ON digitization_training_inputs FOR EACH ROW EXECUTE FUNCTION digitization_training_input_guard();
CREATE FUNCTION digitization_training_stop_input(engine_ref uuid,stage_ref uuid,execution_ref uuid,fence_ref text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT input.source FROM digitization_training_inputs input JOIN processing_stages s ON s.id IN(input.stage_id,input.export_stage_id) JOIN processing_runs r ON r.id=s.run_id
 WHERE input.digitization_id=engine_ref AND s.id=stage_ref AND s.execution_id=execution_ref AND s.fencing_token::text=fence_ref
 AND ((r.created_by=actor_id() AND digitization_target_access(engine_ref) AND r.state IN('cancel_requested','cancelled'))
 OR (actor_id()='00000000-0000-4000-8000-000000000010'::uuid AND EXISTS(SELECT 1 FROM digitization_deletion_jobs j WHERE j.kind='stop_run' AND j.run_id=r.id AND j.state='pending')))
$$;
CREATE FUNCTION digitization_training_gpu_reservation(stage_ref uuid,execution_ref uuid,fence_ref text) RETURNS TABLE(slot_id uuid,slot_fence text,lease_until timestamptz) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT g.id,g.fencing_token::text,g.lease_until FROM digitization_gpu_slots g JOIN processing_stages s ON s.id=g.stage_id JOIN processing_runs r ON r.id=s.run_id
 WHERE s.id=stage_ref AND s.profile_id='gsplat-1.5.3-cu126-fixed-density-investigation-v1' AND g.execution_id=execution_ref AND g.execution_fence::text=fence_ref AND r.created_by=actor_id() AND r.organization_id=org_id() AND digitization_target_access(s.digitization_id)
$$;
REVOKE ALL ON FUNCTION digitization_training_stop_input(uuid,uuid,uuid,text),digitization_training_gpu_reservation(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION digitization_training_stop_input(uuid,uuid,uuid,text),digitization_training_gpu_reservation(uuid,uuid,text) TO haven_app;
-- Internal collector/cleanup calls this only after the runner confirms that its
-- child has stopped. Failed stages are not evidence of termination by themselves.
CREATE FUNCTION digitization_release_stopped_training_gpu(stage_ref uuid,execution_ref uuid,fence_ref text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM processing_stages s JOIN processing_runs r ON r.id=s.run_id WHERE s.id=stage_ref AND s.execution_id=execution_ref AND s.fencing_token::text=fence_ref AND s.profile_id='gsplat-1.5.3-cu126-fixed-density-investigation-v1' AND ((s.state IN('succeeded','failed_terminal','cancelled') AND r.created_by=actor_id() AND r.organization_id=org_id() AND digitization_target_access(s.digitization_id)) OR (actor_id()='00000000-0000-4000-8000-000000000010'::uuid AND EXISTS(SELECT 1 FROM digitization_deletion_jobs j WHERE j.run_id=r.id AND j.kind='stop_run' AND j.state='pending')))) THEN RETURN false;END IF;
 UPDATE digitization_gpu_slots SET stage_id=NULL,execution_id=NULL,execution_fence=NULL,lease_until=NULL WHERE stage_id=stage_ref AND execution_id=execution_ref AND execution_fence::text=fence_ref;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION digitization_release_stopped_training_gpu(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION digitization_release_stopped_training_gpu(uuid,uuid,text) TO haven_app;
