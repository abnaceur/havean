-- Service dispatch sees only opaque event IDs. It receives no raw source,
-- actor capability, result, receipt body or private processing table access.
CREATE FUNCTION digitization_recoverable_events() RETURNS TABLE(event_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT DISTINCT effect.event_id
 FROM outbox_effects effect
 CROSS JOIN LATERAL jsonb_array_elements(effect.receipt->'executions') execution
 JOIN processing_stages stage ON stage.id::text=execution->>'stageId'
 JOIN processing_runs run ON run.id=stage.run_id
 JOIN property_digitizations engine ON engine.id=stage.digitization_id
 WHERE effect.consumer='digitization' AND stage.state IN('leased','running')
  AND run.state IN('queued','running') AND run.cancel_requested_at IS NULL AND run.deadline>now()
  AND engine.state='active' AND engine.current_input_revision=stage.input_revision
$$;
