ALTER TABLE processing_runs ADD COLUMN started_at timestamptz;
CREATE FUNCTION digitization_run_clock_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='INSERT' AND NEW.started_at IS NOT NULL OR TG_OP='UPDATE' AND OLD.started_at IS NOT NULL AND NEW.started_at IS DISTINCT FROM OLD.started_at OR
 TG_OP='UPDATE' AND OLD.started_at IS NULL AND NEW.started_at IS NOT NULL AND (OLD.state<>'queued' OR NEW.state<>'running' OR abs(extract(epoch FROM NEW.started_at-statement_timestamp()))>5) THEN
 RAISE EXCEPTION 'The processing budget clock is server-owned and cannot restart' USING ERRCODE='23514';END IF;RETURN NEW;
END $$;
CREATE TRIGGER run_budget_clock BEFORE INSERT OR UPDATE ON processing_runs FOR EACH ROW EXECUTE FUNCTION digitization_run_clock_guard();
CREATE FUNCTION digitization_budget_capacity(engine uuid,seconds integer,scratch_bytes numeric,exclude_run uuid DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE org uuid;reserved_seconds numeric;reserved_scratch numeric;active_count integer;
BEGIN
 SELECT organization_id INTO org FROM property_digitizations WHERE id=engine AND state='active';
 IF org IS NULL OR org IS DISTINCT FROM org_id() OR NOT digitization_target_access(engine) OR NOT EXISTS(SELECT 1 FROM memberships WHERE user_id=actor_id() AND organization_id=org AND status='active' AND role IN('agent','agency_manager')) OR seconds NOT BETWEEN 1 AND 3600 OR scratch_bytes NOT BETWEEN 1 AND 8589934592 THEN RETURN false;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('digitization-budget:'||org::text,0));
 SELECT count(*),coalesce(sum((budget->>'maxSeconds')::numeric),0),coalesce(sum((budget->>'maxScratchBytes')::numeric),0) INTO active_count,reserved_seconds,reserved_scratch FROM processing_runs
 WHERE organization_id=org AND state IN('draft','queued','running','cancel_requested') AND deadline>statement_timestamp() AND (exclude_run IS NULL OR id<>exclude_run);
 RETURN active_count<4 AND reserved_seconds+seconds<=7200 AND reserved_scratch+scratch_bytes<=17179869184;
END $$;
REVOKE ALL ON FUNCTION digitization_budget_capacity(uuid,integer,numeric,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION digitization_budget_capacity(uuid,integer,numeric,uuid) TO haven_app;
