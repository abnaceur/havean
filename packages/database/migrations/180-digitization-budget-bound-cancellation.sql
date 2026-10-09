CREATE OR REPLACE FUNCTION digitization_cancellation_metadata(engine_ref uuid,run_ref uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('version',run.version,'state',run.state,'stages',coalesce((
  SELECT jsonb_agg(to_jsonb(stage)||jsonb_build_object('fencing_token',stage.fencing_token::text,'run_budget',run.budget,'deadline',least(run.deadline,coalesce(run.started_at,statement_timestamp())+(run.budget->>'maxSeconds')::integer*interval '1 second')))
  FROM processing_stages stage WHERE stage.run_id=run.id),'[]'::jsonb),'sources',revision.source_set)
 FROM processing_runs run JOIN property_input_revisions revision
  ON revision.digitization_id=run.digitization_id AND revision.revision=run.input_revision
 WHERE run.id=run_ref AND run.digitization_id=engine_ref AND run.created_by=actor_id()
  AND digitization_target_access(engine_ref) AND run.state IN('cancel_requested','cancelled')
$$;
