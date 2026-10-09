CREATE UNIQUE INDEX gpu_one_slot_per_stage ON digitization_gpu_slots(stage_id) WHERE stage_id IS NOT NULL;
CREATE OR REPLACE FUNCTION digitization_acquire_gpu(stage_ref uuid,execution_ref uuid,fence_ref bigint) RETURNS TABLE(slot_id uuid,fencing_token text,lease_until timestamptz,execution_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE slot digitization_gpu_slots;stage processing_stages;
BEGIN
 IF NOT digitization_gpu_context(stage_ref,execution_ref,fence_ref) THEN RETURN;END IF;
 IF EXISTS(SELECT 1 FROM digitization_gpu_slots res WHERE res.stage_id=stage_ref AND (res.execution_id<>execution_ref OR res.execution_fence<>fence_ref OR res.lease_until<=statement_timestamp())) THEN RETURN;END IF;
 SELECT * INTO stage FROM processing_stages WHERE id=stage_ref;
 SELECT * INTO slot FROM digitization_gpu_slots res WHERE res.enabled AND stage.profile_id=ANY(res.profiles) AND (res.stage_id IS NULL OR res.stage_id=stage_ref AND res.execution_id=execution_ref AND res.execution_fence=fence_ref) ORDER BY (res.stage_id=stage_ref) DESC NULLS LAST,res.id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF slot.id IS NULL OR slot.stage_id IS NOT NULL AND slot.lease_until<=statement_timestamp() THEN RETURN;END IF;
 IF slot.stage_id IS NULL THEN
  UPDATE digitization_gpu_slots SET stage_id=stage_ref,execution_id=execution_ref,execution_fence=fence_ref,fencing_token=digitization_gpu_slots.fencing_token+1,lease_until=stage.lease_until WHERE id=slot.id RETURNING * INTO slot;
 END IF;
 RETURN QUERY SELECT slot.id,slot.fencing_token::text,slot.lease_until,slot.execution_id;
END $$;
CREATE FUNCTION digitization_stage_gpu_reserved(stage_ref uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM digitization_gpu_slots slot JOIN processing_stages s ON s.id=slot.stage_id JOIN processing_runs r ON r.id=s.run_id WHERE slot.stage_id=stage_ref AND r.created_by=actor_id() AND r.organization_id=org_id() AND digitization_target_access(s.digitization_id))
$$;
REVOKE ALL ON FUNCTION digitization_stage_gpu_reserved(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION digitization_stage_gpu_reserved(uuid) TO haven_app;
