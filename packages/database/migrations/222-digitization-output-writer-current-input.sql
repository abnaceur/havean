-- Correct the current source revision column; migration221 stays immutable.
CREATE OR REPLACE FUNCTION digitization_output_writer_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE workspace property_digitizations;run processing_runs;stage processing_stages;asset_version_ref int;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF OLD.created_by IS DISTINCT FROM actor_id() OR OLD.organization_id IS DISTINCT FROM org_id() OR OLD.state<>'writing' OR NEW.state<>'finished' OR NEW.version<>OLD.version+1 OR NEW.finished_at IS NULL OR (to_jsonb(NEW)-ARRAY['state','version','finished_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version','finished_at']) THEN RAISE EXCEPTION 'Exact writer completion required' USING ERRCODE='42501';END IF;
  -- Closing the caller's own opaque writer lease grants no read/write access
  -- and remains permitted after deletion revokes its ordinary private scope.
  RETURN NEW;
 END IF;
 SELECT * INTO workspace FROM property_digitizations WHERE id=NEW.digitization_id;
 SELECT * INTO run FROM processing_runs WHERE id=NEW.run_id;
 SELECT * INTO stage FROM processing_stages WHERE id=NEW.stage_id;
 SELECT (s->>'assetVersion')::int INTO asset_version_ref FROM property_input_revisions inputs CROSS JOIN LATERAL jsonb_array_elements(inputs.source_set) s WHERE inputs.digitization_id=NEW.digitization_id AND inputs.revision=NEW.input_revision AND s->>'assetId'=NEW.asset_id::text;
 IF NEW.created_by IS DISTINCT FROM actor_id() OR NEW.organization_id IS DISTINCT FROM org_id() OR workspace.organization_id IS DISTINCT FROM NEW.organization_id OR workspace.state<>'active' OR workspace.current_input_revision<>NEW.input_revision OR run.digitization_id IS DISTINCT FROM NEW.digitization_id OR run.created_by IS DISTINCT FROM actor_id() OR run.cancel_requested_at IS NOT NULL OR run.state NOT IN('queued','running') OR stage.run_id IS DISTINCT FROM run.id OR stage.execution_id IS DISTINCT FROM NEW.execution_id OR stage.fencing_token<>NEW.fencing_token OR stage.state NOT IN('leased','running') OR stage.lease_until<=statement_timestamp() OR NEW.version<>1 OR NEW.state<>'writing' OR NEW.finished_at IS NOT NULL OR NEW.write_deadline<=statement_timestamp() OR NEW.write_deadline>statement_timestamp()+interval '3 minutes' OR NEW.write_until<NEW.write_deadline+interval '2 minutes' OR NEW.write_until>statement_timestamp()+interval '5 minutes' OR NOT digitization_private_access(workspace.id) OR NOT coalesce(digitization_asset_access(workspace.id,NEW.asset_id,asset_version_ref,NEW.input_revision,'document_processing'),false) OR NOT EXISTS(SELECT 1 FROM profiles p JOIN memberships m ON m.user_id=p.id WHERE p.id=actor_id() AND p.state='active' AND m.organization_id=NEW.organization_id AND m.status='active' AND m.role IN('agent','agency_manager')) THEN RAISE EXCEPTION 'Current bounded private collector required' USING ERRCODE='42501';END IF;
 RETURN NEW;
END $$;
