-- Inventory owns execution state. A queue delivery cannot bypass dependency order.
CREATE FUNCTION digitization_stage_workflow_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE run processing_runs; allowed boolean;
BEGIN
 SELECT * INTO run FROM processing_runs WHERE id=NEW.run_id FOR UPDATE;
 IF TG_OP='INSERT' THEN
  IF run.state<>'draft' THEN RAISE EXCEPTION 'Stage graph is sealed after dispatch' USING ERRCODE='23514';END IF;
  RETURN NEW;
 END IF;
 allowed:=NEW.state=OLD.state OR CASE OLD.state
  WHEN 'pending' THEN NEW.state IN('queued','awaiting_input','skipped','cancelled')
  WHEN 'queued' THEN NEW.state IN('leased','cancelled')
  WHEN 'leased' THEN NEW.state IN('running','failed_retryable','failed_terminal','awaiting_input','cancelled')
  WHEN 'running' THEN NEW.state IN('succeeded','failed_retryable','failed_terminal','awaiting_input','cancelled')
  WHEN 'failed_retryable' THEN NEW.state IN('queued','failed_terminal','cancelled')
  WHEN 'awaiting_input' THEN NEW.state IN('queued','skipped','cancelled')
  ELSE false END;
 IF NOT allowed THEN RAISE EXCEPTION 'Illegal processing stage transition' USING ERRCODE='23514';END IF;
 IF NEW.state IN('queued','leased','running','succeeded') THEN
  IF run.state NOT IN('queued','running') OR run.cancel_requested_at IS NOT NULL OR run.deadline<=statement_timestamp() THEN RAISE EXCEPTION 'Run is not executable' USING ERRCODE='23514';END IF;
  IF EXISTS(SELECT 1 FROM processing_stage_dependencies d JOIN processing_stages s ON s.id=d.dependency_id WHERE d.stage_id=NEW.id AND s.state<>'succeeded') THEN RAISE EXCEPTION 'Stage dependencies are not satisfied' USING ERRCODE='23514';END IF;
 END IF;
 IF NEW.state='leased' AND OLD.state='queued' THEN
  IF NEW.attempt<>OLD.attempt+1 OR NEW.fencing_token<>OLD.fencing_token+1 OR NEW.execution_id IS NULL OR NEW.execution_id IS NOT DISTINCT FROM OLD.execution_id OR NEW.lease_until IS NULL OR NEW.lease_until<=statement_timestamp() OR NEW.lease_until>statement_timestamp()+interval '5 minutes' THEN RAISE EXCEPTION 'Fresh bounded execution lease required' USING ERRCODE='23514';END IF;
 ELSE
  IF NEW.attempt<>OLD.attempt OR NEW.fencing_token<>OLD.fencing_token OR NEW.execution_id IS DISTINCT FROM OLD.execution_id THEN RAISE EXCEPTION 'Execution identity changes only when acquiring a lease' USING ERRCODE='23514';END IF;
  IF OLD.state IN('leased','running') AND NEW.state<>'cancelled' AND (OLD.lease_until IS NULL OR OLD.lease_until<=statement_timestamp()) THEN
   -- Reconciliation can expire a lease; it cannot commit late outputs.
   IF NEW.state NOT IN('failed_retryable','failed_terminal') THEN RAISE EXCEPTION 'Execution lease expired' USING ERRCODE='23514';END IF;
  END IF;
 END IF;
 IF NEW.state IN('leased','running') AND (NEW.lease_until IS NULL OR NEW.lease_until<=statement_timestamp() OR NEW.lease_until>statement_timestamp()+interval '5 minutes') THEN RAISE EXCEPTION 'Bounded active lease required' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER stage_workflow BEFORE INSERT OR UPDATE ON processing_stages FOR EACH ROW EXECUTE FUNCTION digitization_stage_workflow_guard();

CREATE FUNCTION digitization_dependency_graph_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE run processing_runs;
BEGIN
 SELECT r.* INTO run FROM processing_runs r JOIN processing_stages s ON s.run_id=r.id WHERE s.id=NEW.stage_id FOR UPDATE OF r;
 IF run.state<>'draft' THEN RAISE EXCEPTION 'Stage graph is sealed after dispatch' USING ERRCODE='23514';END IF;
 IF EXISTS(WITH RECURSIVE ancestors(id) AS (
  SELECT NEW.dependency_id UNION SELECT d.dependency_id FROM processing_stage_dependencies d JOIN ancestors a ON d.stage_id=a.id
 ) SELECT 1 FROM ancestors WHERE id=NEW.stage_id) THEN RAISE EXCEPTION 'Stage dependency cycle' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER dependency_graph BEFORE INSERT ON processing_stage_dependencies FOR EACH ROW EXECUTE FUNCTION digitization_dependency_graph_guard();

CREATE FUNCTION digitization_run_workflow_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE allowed boolean;
BEGIN
 allowed:=NEW.state=OLD.state OR CASE OLD.state
  WHEN 'draft' THEN NEW.state IN('queued','cancel_requested')
  WHEN 'queued' THEN NEW.state IN('running','awaiting_input','failed','cancel_requested')
  WHEN 'running' THEN NEW.state IN('awaiting_input','awaiting_review','partially_ready','failed','cancel_requested')
  WHEN 'awaiting_input' THEN NEW.state IN('queued','running','partially_ready','failed','cancel_requested')
  WHEN 'awaiting_review' THEN NEW.state IN('ready','partially_ready','cancel_requested')
  WHEN 'partially_ready' THEN NEW.state IN('queued','awaiting_review','ready','cancel_requested')
  WHEN 'failed' THEN NEW.state IN('queued','cancel_requested')
  WHEN 'cancel_requested' THEN NEW.state='cancelled'
  ELSE false END;
 IF NOT allowed THEN RAISE EXCEPTION 'Illegal processing run transition' USING ERRCODE='23514';END IF;
 IF NEW.state IN('queued','running') AND (NEW.cancel_requested_at IS NOT NULL OR NEW.deadline<=statement_timestamp()) THEN RAISE EXCEPTION 'Cancelled or expired run cannot execute' USING ERRCODE='23514';END IF;
 IF NEW.state='queued' AND NOT EXISTS(SELECT 1 FROM processing_stages WHERE run_id=NEW.id) THEN RAISE EXCEPTION 'Run requires a stage graph' USING ERRCODE='23514';END IF;
 IF NEW.state IN('awaiting_review','ready') AND EXISTS(SELECT 1 FROM processing_stages WHERE run_id=NEW.id AND state NOT IN('succeeded','skipped')) THEN RAISE EXCEPTION 'Run has unfinished stages' USING ERRCODE='23514';END IF;
 IF NEW.state IN('cancel_requested','cancelled') AND NEW.cancel_requested_at IS NULL THEN RAISE EXCEPTION 'Cancellation timestamp required' USING ERRCODE='23514';END IF;
 IF OLD.cancel_requested_at IS NOT NULL AND NEW.cancel_requested_at IS DISTINCT FROM OLD.cancel_requested_at THEN RAISE EXCEPTION 'Cancellation is irreversible' USING ERRCODE='23514';END IF;
 IF NEW.state='cancelled' AND EXISTS(SELECT 1 FROM processing_stages WHERE run_id=NEW.id AND state NOT IN('succeeded','failed_terminal','skipped','cancelled')) THEN RAISE EXCEPTION 'Cancel active stages before closing run' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER run_workflow BEFORE UPDATE ON processing_runs FOR EACH ROW EXECUTE FUNCTION digitization_run_workflow_guard();
