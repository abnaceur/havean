CREATE OR REPLACE FUNCTION digitization_budget_capacity(engine uuid,seconds integer,scratch_bytes numeric,exclude_run uuid DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE org uuid;reserved_seconds numeric;reserved_scratch numeric;active_count integer;
BEGIN
 SELECT organization_id INTO org FROM property_digitizations WHERE id=engine AND state='active';
 IF org IS NULL OR org IS DISTINCT FROM org_id() OR NOT digitization_target_access(engine) OR NOT EXISTS(SELECT 1 FROM memberships WHERE user_id=actor_id() AND organization_id=org AND status='active' AND role IN('agent','agency_manager')) OR seconds NOT BETWEEN 1 AND 3600 OR scratch_bytes NOT BETWEEN 1 AND 8589934592 THEN RETURN false;END IF;
 IF exclude_run IS NOT NULL AND NOT EXISTS(SELECT 1 FROM processing_runs WHERE id=exclude_run AND digitization_id=engine AND created_by=actor_id()) THEN RETURN false;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('digitization-budget:'||org::text,0));
 SELECT count(*),coalesce(sum((budget->>'maxSeconds')::numeric),0),coalesce(sum((budget->>'maxScratchBytes')::numeric),0) INTO active_count,reserved_seconds,reserved_scratch FROM processing_runs
 WHERE organization_id=org AND state IN('draft','queued','running','cancel_requested') AND deadline>statement_timestamp() AND (exclude_run IS NULL OR id<>exclude_run);
 RETURN active_count<4 AND reserved_seconds+seconds<=7200 AND reserved_scratch+scratch_bytes<=17179869184;
END $$;
CREATE TABLE digitization_gpu_slots(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),resource_key text UNIQUE NOT NULL CHECK(length(resource_key) BETWEEN 1 AND 100),
 enabled boolean NOT NULL DEFAULT false,profiles text[] NOT NULL CHECK(cardinality(profiles) BETWEEN 1 AND 20),
 fencing_token bigint NOT NULL DEFAULT 0 CHECK(fencing_token>=0),
 stage_id uuid REFERENCES processing_stages,execution_id uuid,execution_fence bigint,lease_until timestamptz,
 CHECK((stage_id IS NULL AND execution_id IS NULL AND execution_fence IS NULL AND lease_until IS NULL) OR (stage_id IS NOT NULL AND execution_id IS NOT NULL AND execution_fence IS NOT NULL AND lease_until IS NOT NULL))
);
ALTER TABLE digitization_gpu_slots ENABLE ROW LEVEL SECURITY;
-- No direct application policies: registration and physical capability checks
-- belong to trusted deployment tooling. A lease never asserts a CUDA capability.
CREATE FUNCTION digitization_gpu_context(stage_ref uuid,execution_ref uuid,fence_ref bigint) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM processing_stages s JOIN processing_runs r ON r.id=s.run_id JOIN property_digitizations d ON d.id=s.digitization_id
 WHERE s.id=stage_ref AND s.execution_id=execution_ref AND s.fencing_token=fence_ref AND s.state IN('leased','running') AND s.lease_until>statement_timestamp()
 AND s.stage_type IN('camera_solve','splat_train') AND r.created_by=actor_id() AND r.organization_id=org_id() AND r.state IN('queued','running') AND r.cancel_requested_at IS NULL
 AND least(r.deadline,coalesce(r.started_at,statement_timestamp())+(r.budget->>'maxSeconds')::integer*interval '1 second')>statement_timestamp()
 AND d.current_input_revision=s.input_revision AND d.state='active' AND digitization_target_access(d.id) AND digitization_revision_access(d.id,s.input_revision,'document_processing')
 AND EXISTS(SELECT 1 FROM memberships WHERE user_id=actor_id() AND organization_id=org_id() AND status='active' AND role IN('agent','agency_manager')))
$$;
CREATE FUNCTION digitization_acquire_gpu(stage_ref uuid,execution_ref uuid,fence_ref bigint) RETURNS TABLE(slot_id uuid,fencing_token text,lease_until timestamptz,execution_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE slot digitization_gpu_slots;stage processing_stages;
BEGIN
 IF NOT digitization_gpu_context(stage_ref,execution_ref,fence_ref) THEN RETURN;END IF;
 SELECT * INTO stage FROM processing_stages WHERE id=stage_ref;
 SELECT * INTO slot FROM digitization_gpu_slots WHERE enabled AND stage.profile_id=ANY(profiles) AND (stage_id IS NULL OR stage_id=stage_ref AND execution_id=execution_ref AND execution_fence=fence_ref) ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF slot.id IS NULL OR slot.stage_id IS NOT NULL AND slot.lease_until<=statement_timestamp() THEN RETURN;END IF;
 IF slot.stage_id IS NULL THEN
  UPDATE digitization_gpu_slots SET stage_id=stage_ref,execution_id=execution_ref,execution_fence=fence_ref,fencing_token=digitization_gpu_slots.fencing_token+1,lease_until=stage.lease_until WHERE id=slot.id RETURNING * INTO slot;
 END IF;
 RETURN QUERY SELECT slot.id,slot.fencing_token::text,slot.lease_until,slot.execution_id;
END $$;
CREATE FUNCTION digitization_renew_gpu(stage_ref uuid,execution_ref uuid,fence_ref bigint,slot_ref uuid,slot_fence bigint) RETURNS TABLE(slot_id uuid,fencing_token text,lease_until timestamptz,execution_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE slot digitization_gpu_slots;stage processing_stages;
BEGIN
 IF NOT digitization_gpu_context(stage_ref,execution_ref,fence_ref) THEN RETURN;END IF;
 SELECT * INTO stage FROM processing_stages WHERE id=stage_ref;
 SELECT * INTO slot FROM digitization_gpu_slots WHERE id=slot_ref AND stage_id=stage_ref AND execution_id=execution_ref AND execution_fence=fence_ref AND fencing_token=slot_fence AND lease_until>statement_timestamp() FOR UPDATE;
 IF slot.id IS NULL THEN RETURN;END IF;
 UPDATE digitization_gpu_slots SET lease_until=stage.lease_until WHERE id=slot.id RETURNING * INTO slot;
 RETURN QUERY SELECT slot.id,slot.fencing_token::text,slot.lease_until,slot.execution_id;
END $$;
CREATE FUNCTION digitization_release_gpu(stage_ref uuid,execution_ref uuid,fence_ref bigint,slot_ref uuid,slot_fence bigint) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 -- Terminal stage closure comes from validated runner/cancellation receipts.
 -- A timeout alone never frees a slot while an old process could still run.
 IF NOT EXISTS(SELECT 1 FROM processing_stages s JOIN processing_runs r ON r.id=s.run_id WHERE s.id=stage_ref AND s.execution_id=execution_ref AND s.fencing_token=fence_ref AND s.state IN('succeeded','cancelled','failed_terminal') AND r.created_by=actor_id() AND r.organization_id=org_id() AND digitization_target_access(s.digitization_id)) THEN RETURN false;END IF;
 UPDATE digitization_gpu_slots SET stage_id=NULL,execution_id=NULL,execution_fence=NULL,lease_until=NULL WHERE id=slot_ref AND stage_id=stage_ref AND execution_id=execution_ref AND execution_fence=fence_ref AND fencing_token=slot_fence;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION digitization_gpu_context(uuid,uuid,bigint),digitization_acquire_gpu(uuid,uuid,bigint),digitization_renew_gpu(uuid,uuid,bigint,uuid,bigint),digitization_release_gpu(uuid,uuid,bigint,uuid,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION digitization_acquire_gpu(uuid,uuid,bigint),digitization_renew_gpu(uuid,uuid,bigint,uuid,bigint),digitization_release_gpu(uuid,uuid,bigint,uuid,bigint) TO haven_app;
