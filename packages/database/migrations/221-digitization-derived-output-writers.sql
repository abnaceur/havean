-- Every collector has its own durable, bounded writer lease. Concurrent
-- collectors cannot release each other's leases; a killed writer expires.
CREATE TABLE digitization_output_writes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 digitization_id uuid NOT NULL REFERENCES property_digitizations,
 organization_id uuid NOT NULL REFERENCES organizations,
 created_by uuid NOT NULL REFERENCES profiles,
 run_id uuid NOT NULL,stage_id uuid NOT NULL,execution_id uuid NOT NULL,
 input_revision int NOT NULL,asset_id uuid NOT NULL REFERENCES media_assets,
 fencing_token bigint NOT NULL CHECK(fencing_token>0),
 version int NOT NULL DEFAULT 1 CHECK(version>0),
 state text NOT NULL DEFAULT 'writing' CHECK(state IN('writing','finished')),
 write_deadline timestamptz NOT NULL,write_until timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,
 FOREIGN KEY(run_id,digitization_id) REFERENCES processing_runs(id,digitization_id),
 FOREIGN KEY(stage_id,digitization_id) REFERENCES processing_stages(id,digitization_id),
 FOREIGN KEY(digitization_id,input_revision) REFERENCES property_input_revisions(digitization_id,revision),
 CHECK(write_deadline<write_until),CHECK((state='finished')=(finished_at IS NOT NULL))
);
ALTER TABLE digitization_output_writes ENABLE ROW LEVEL SECURITY;
CREATE POLICY output_writer_read ON digitization_output_writes FOR SELECT USING(digitization_private_access(digitization_id));
CREATE INDEX output_writers_cleanup ON digitization_output_writes(digitization_id,write_until) WHERE state='writing';
CREATE FUNCTION digitization_output_writer_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
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
 IF NEW.created_by IS DISTINCT FROM actor_id() OR NEW.organization_id IS DISTINCT FROM org_id() OR workspace.organization_id IS DISTINCT FROM NEW.organization_id OR workspace.state<>'active' OR workspace.input_revision<>NEW.input_revision OR run.digitization_id IS DISTINCT FROM NEW.digitization_id OR run.created_by IS DISTINCT FROM actor_id() OR run.cancel_requested_at IS NOT NULL OR run.state NOT IN('queued','running') OR stage.run_id IS DISTINCT FROM run.id OR stage.execution_id IS DISTINCT FROM NEW.execution_id OR stage.fencing_token<>NEW.fencing_token OR stage.state NOT IN('leased','running') OR stage.lease_until<=statement_timestamp() OR NEW.version<>1 OR NEW.state<>'writing' OR NEW.finished_at IS NOT NULL OR NEW.write_deadline<=statement_timestamp() OR NEW.write_deadline>statement_timestamp()+interval '3 minutes' OR NEW.write_until<NEW.write_deadline+interval '2 minutes' OR NEW.write_until>statement_timestamp()+interval '5 minutes' OR NOT digitization_private_access(workspace.id) OR NOT coalesce(digitization_asset_access(workspace.id,NEW.asset_id,asset_version_ref,NEW.input_revision,'document_processing'),false) OR NOT EXISTS(SELECT 1 FROM profiles p JOIN memberships m ON m.user_id=p.id WHERE p.id=actor_id() AND p.state='active' AND m.organization_id=NEW.organization_id AND m.status='active' AND m.role IN('agent','agency_manager')) THEN RAISE EXCEPTION 'Current bounded private collector required' USING ERRCODE='42501';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER output_writer_guard BEFORE INSERT OR UPDATE ON digitization_output_writes FOR EACH ROW EXECUTE FUNCTION digitization_output_writer_guard();
CREATE POLICY output_writer_create ON digitization_output_writes FOR INSERT WITH CHECK(created_by=actor_id() AND organization_id=org_id() AND digitization_private_access(digitization_id));
CREATE FUNCTION digitization_finish_output_write(writer_ref uuid,version_ref int) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE writer digitization_output_writes;
BEGIN
 SELECT * INTO writer FROM digitization_output_writes WHERE id=writer_ref AND created_by=actor_id() AND organization_id=org_id() FOR UPDATE;
 IF writer.id IS NULL THEN RAISE EXCEPTION 'Exact private writer required' USING ERRCODE='42501';END IF;
 IF writer.state='finished' AND writer.version=version_ref+1 THEN RETURN true;END IF;
 IF writer.state<>'writing' OR writer.version<>version_ref THEN RAISE EXCEPTION 'Current writer version required' USING ERRCODE='40001';END IF;
 UPDATE digitization_output_writes SET state='finished',version=version+1,finished_at=statement_timestamp() WHERE id=writer.id;RETURN true;
END $$;
REVOKE ALL ON FUNCTION digitization_output_writer_guard() FROM PUBLIC,haven_app;
REVOKE ALL ON FUNCTION digitization_finish_output_write(uuid,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION digitization_finish_output_write(uuid,int) TO haven_app;

-- A persisted run owns its entire derived prefix, including bytes written
-- before a failed artifact transaction. Never sweep another run/mandate.
ALTER TABLE digitization_deletion_jobs DROP CONSTRAINT digitization_deletion_jobs_kind_check,DROP CONSTRAINT digitization_deletion_jobs_check;
ALTER TABLE digitization_deletion_jobs ADD CONSTRAINT deletion_job_kind CHECK(kind IN('stop_run','object','run_outputs')),
 ADD CONSTRAINT deletion_job_shape CHECK((kind='stop_run' AND run_id IS NOT NULL AND object_key IS NULL) OR (kind='object' AND run_id IS NULL AND object_key IS NOT NULL) OR (kind='run_outputs' AND run_id IS NOT NULL AND digitization_id IS NOT NULL AND object_key='digitization/'||digitization_id::text||'/'||run_id::text||'/' AND upload_id IS NULL));
CREATE UNIQUE INDEX tenant_run_outputs_once ON digitization_deletion_jobs(tenant_deletion_id,run_id) WHERE tenant_deletion_id IS NOT NULL AND kind='run_outputs';
CREATE FUNCTION digitization_enqueue_run_outputs(stop_ref uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE stop digitization_deletion_jobs;run processing_runs;
BEGIN
 SELECT * INTO stop FROM digitization_deletion_jobs WHERE id=stop_ref AND kind='stop_run';
 SELECT * INTO run FROM processing_runs WHERE id=stop.run_id;
 IF stop.id IS NULL OR run.id IS NULL OR stop.digitization_id IS DISTINCT FROM run.digitization_id OR NOT ((stop.user_id IS NOT NULL AND EXISTS(SELECT 1 FROM profiles p JOIN account_deletion_requests request ON request.user_id=p.id WHERE p.id=stop.user_id AND p.state='deletion_requested') AND (run.created_by=stop.user_id OR EXISTS(SELECT 1 FROM property_input_revisions inputs CROSS JOIN LATERAL jsonb_array_elements(inputs.source_set) s JOIN media_assets asset ON asset.id=(s->>'assetId')::uuid WHERE inputs.digitization_id=run.digitization_id AND inputs.revision=run.input_revision AND asset.owner_id=stop.user_id AND asset.visibility='private'))) OR (stop.tenant_deletion_id IS NOT NULL AND EXISTS(SELECT 1 FROM digitization_tenant_deletions request WHERE request.id=stop.tenant_deletion_id AND request.organization_id=run.organization_id AND request.state='requested'))) THEN RAISE EXCEPTION 'Exact requested erasure run required' USING ERRCODE='42501';END IF;
 INSERT INTO digitization_deletion_jobs(user_id,tenant_deletion_id,kind,run_id,digitization_id,object_key,metadata)
 VALUES(stop.user_id,stop.tenant_deletion_id,'run_outputs',run.id,run.digitization_id,'digitization/'||run.digitization_id::text||'/'||run.id::text||'/',jsonb_build_object('category','run_outputs')) ON CONFLICT DO NOTHING;
END $$;
CREATE FUNCTION digitization_run_output_cleanup_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.kind='stop_run' THEN PERFORM digitization_enqueue_run_outputs(NEW.id);END IF;RETURN NEW;
END $$;
CREATE TRIGGER deletion_run_output_cleanup AFTER INSERT ON digitization_deletion_jobs FOR EACH ROW EXECUTE FUNCTION digitization_run_output_cleanup_trigger();
-- Previously requested erasures also cover their uncommitted private outputs.
DO $$ DECLARE stop_ref uuid;BEGIN FOR stop_ref IN SELECT id FROM digitization_deletion_jobs WHERE kind='stop_run' LOOP PERFORM digitization_enqueue_run_outputs(stop_ref);END LOOP;END $$;
REVOKE ALL ON FUNCTION digitization_enqueue_run_outputs(uuid),digitization_run_output_cleanup_trigger() FROM PUBLIC,haven_app;

CREATE OR REPLACE FUNCTION digitization_claim_deletion_job() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE job digitization_deletion_jobs;
BEGIN
 IF actor_id() IS DISTINCT FROM '00000000-0000-4000-8000-000000000010'::uuid THEN RAISE EXCEPTION 'Trusted deletion maintenance identity required' USING ERRCODE='42501';END IF;
 SELECT * INTO job FROM digitization_deletion_jobs j WHERE j.state='pending' AND NOT EXISTS(SELECT 1 FROM media_assets copying WHERE copying.id::text=j.metadata->>'assetId' AND copying.capture_copy_until>statement_timestamp()) AND (j.kind='stop_run' OR NOT EXISTS(SELECT 1 FROM digitization_output_writes writing WHERE writing.state='writing' AND writing.write_until>statement_timestamp() AND (writing.run_id=j.run_id OR writing.asset_id::text=j.metadata->>'assetId' OR EXISTS(SELECT 1 FROM artifacts ar WHERE ar.id::text=j.metadata->>'artifactId' AND ar.run_id=writing.run_id) OR EXISTS(SELECT 1 FROM media_assets captured WHERE captured.id=writing.asset_id AND captured.digitization_capture_id::text=j.metadata->>'captureId')))) AND (j.lease_until IS NULL OR j.lease_until<=statement_timestamp()) AND ((j.user_id IS NOT NULL AND EXISTS(SELECT 1 FROM profiles WHERE id=j.user_id AND state='deletion_requested')) OR (j.tenant_deletion_id IS NOT NULL AND EXISTS(SELECT 1 FROM digitization_tenant_deletions WHERE id=j.tenant_deletion_id AND state='requested'))) AND (j.kind='stop_run' OR NOT EXISTS(SELECT 1 FROM digitization_deletion_jobs stop WHERE stop.kind='stop_run' AND stop.state='pending' AND (stop.user_id=j.user_id OR stop.tenant_deletion_id=j.tenant_deletion_id))) ORDER BY CASE kind WHEN 'stop_run' THEN 0 ELSE 1 END,j.created_at,j.id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL;END IF;
 UPDATE digitization_deletion_jobs SET fence=fence+1,lease_until=statement_timestamp()+interval '60 seconds' WHERE id=job.id RETURNING * INTO job;
 RETURN to_jsonb(job)||jsonb_build_object('fence',job.fence::text);
END $$;
CREATE FUNCTION digitization_continue_run_output_cleanup(job_ref uuid,fence_ref text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF actor_id() IS DISTINCT FROM '00000000-0000-4000-8000-000000000010'::uuid THEN RAISE EXCEPTION 'Trusted deletion maintenance identity required' USING ERRCODE='42501';END IF;
 UPDATE digitization_deletion_jobs SET lease_until=NULL WHERE id=job_ref AND kind='run_outputs' AND state='pending' AND fence::text=fence_ref AND lease_until>statement_timestamp();RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION digitization_continue_run_output_cleanup(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION digitization_continue_run_output_cleanup(uuid,text) TO haven_app;
