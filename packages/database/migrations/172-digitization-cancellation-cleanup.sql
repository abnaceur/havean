-- Cleanup is target/initiator scoped, even after source processing access expires.
-- These descriptors are used only to mint stop capabilities, never source reads.
CREATE FUNCTION digitization_cancellation_metadata(engine_ref uuid,run_ref uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('version',run.version,'state',run.state,'stages',coalesce((
  SELECT jsonb_agg(to_jsonb(stage)||jsonb_build_object('fencing_token',stage.fencing_token::text,'run_budget',run.budget,'deadline',run.deadline))
  FROM processing_stages stage WHERE stage.run_id=run.id),'[]'::jsonb),'sources',revision.source_set)
 FROM processing_runs run JOIN property_input_revisions revision
  ON revision.digitization_id=run.digitization_id AND revision.revision=run.input_revision
 WHERE run.id=run_ref AND run.digitization_id=engine_ref AND run.created_by=actor_id()
  AND digitization_target_access(engine_ref) AND run.state IN('cancel_requested','cancelled')
$$;
CREATE FUNCTION digitization_close_cancellation(engine_ref uuid,run_ref uuid,expected_version integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE run processing_runs;
BEGIN
 SELECT * INTO run FROM processing_runs WHERE id=run_ref AND digitization_id=engine_ref FOR UPDATE;
 IF run.id IS NULL OR run.created_by<>actor_id() OR NOT digitization_target_access(engine_ref)
  THEN RAISE EXCEPTION 'Cancellation scope denied' USING ERRCODE='42501';END IF;
 IF run.state='cancelled' THEN RETURN jsonb_build_object('id',run.id,'state',run.state,'version',run.version,'changed',false);END IF;
 IF run.state<>'cancel_requested' OR run.version<>expected_version
  THEN RAISE EXCEPTION 'Cancellation changed' USING ERRCODE='23514';END IF;
 UPDATE processing_stages SET state='cancelled',version=version+1 WHERE run_id=run_ref
  AND state NOT IN('succeeded','failed_terminal','skipped','cancelled');
 UPDATE processing_runs SET state='cancelled',version=version+1 WHERE id=run_ref RETURNING * INTO run;
 RETURN jsonb_build_object('id',run.id,'state',run.state,'version',run.version,'changed',true);
END $$;
CREATE OR REPLACE FUNCTION digitization_recoverable_events() RETURNS TABLE(event_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT DISTINCT effect.event_id
 FROM outbox_effects effect
 CROSS JOIN LATERAL jsonb_array_elements(effect.receipt->'executions') execution
 JOIN processing_stages stage ON stage.id::text=execution->>'stageId'
 JOIN processing_runs run ON run.id=stage.run_id
 JOIN property_digitizations engine ON engine.id=stage.digitization_id
 WHERE effect.consumer='digitization' AND stage.state IN('leased','running','failed_retryable')
  AND run.state IN('queued','running') AND run.cancel_requested_at IS NULL AND run.deadline>now()
  AND engine.state='active' AND engine.current_input_revision=stage.input_revision
 UNION
 SELECT effect.event_id FROM outbox_effects effect JOIN processing_runs run
  ON run.id::text=effect.receipt->'cancellation'->>'runId'
 WHERE effect.consumer='digitization' AND run.state='cancel_requested'
$$;
