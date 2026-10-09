CREATE OR REPLACE FUNCTION digitization_release_gpu(stage_ref uuid,execution_ref uuid,fence_ref bigint,slot_ref uuid,slot_fence bigint) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 -- Terminal stage closure comes from validated runner/cancellation receipts.
 -- A timeout alone never frees a slot while an old process could still run.
 IF NOT EXISTS(SELECT 1 FROM processing_stages s JOIN processing_runs r ON r.id=s.run_id WHERE s.id=stage_ref AND s.execution_id=execution_ref AND s.fencing_token=fence_ref AND s.state IN('succeeded','cancelled') AND r.created_by=actor_id() AND r.organization_id=org_id() AND digitization_target_access(s.digitization_id)) THEN RETURN false;END IF;
 UPDATE digitization_gpu_slots SET stage_id=NULL,execution_id=NULL,execution_fence=NULL,lease_until=NULL WHERE id=slot_ref AND stage_id=stage_ref AND execution_id=execution_ref AND execution_fence=fence_ref AND fencing_token=slot_fence;
 RETURN FOUND;
END $$;
