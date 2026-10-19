-- Engine cleanup survives profile/membership revocation. Only the maintenance
-- identity receives opaque stop/delete descriptors; it receives no read grant.
CREATE TABLE digitization_deletion_jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES profiles,
 kind text NOT NULL CHECK(kind IN('stop_run','object')),run_id uuid REFERENCES processing_runs,
 digitization_id uuid REFERENCES property_digitizations,object_key text,upload_id text,
 metadata jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(metadata)='object'),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','complete','retained')),
 fence bigint NOT NULL DEFAULT 0,lease_until timestamptz,created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,
 CHECK((kind='stop_run' AND run_id IS NOT NULL AND object_key IS NULL) OR (kind='object' AND run_id IS NULL AND object_key IS NOT NULL)),
 CHECK((state='complete')=(completed_at IS NOT NULL)),UNIQUE(user_id,kind,run_id),UNIQUE(user_id,kind,object_key)
);
ALTER TABLE digitization_deletion_jobs ENABLE ROW LEVEL SECURITY;
-- Conservative owning-module retention: any non-engine FK reference retains
-- the original for that module's reviewed policy. Financial/history rows remain.
CREATE FUNCTION digitization_asset_has_retained_reference(asset_ref uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ref record;found_ref boolean;
BEGIN
 FOR ref IN SELECT n.nspname schema_name,t.relname table_name,a.attname column_name FROM pg_constraint fk JOIN pg_class t ON t.oid=fk.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace JOIN LATERAL unnest(fk.conkey,fk.confkey) keys(local_key,foreign_key) ON true JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=keys.local_key JOIN pg_attribute target ON target.attrelid=fk.confrelid AND target.attnum=keys.foreign_key
 WHERE fk.contype='f' AND fk.confrelid='media_assets'::regclass AND target.attname='id' AND t.relname NOT IN('digitization_asset_bindings','digitization_evidence_grants','digitization_capture_uploads') LOOP
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.%I WHERE %I=$1)',ref.schema_name,ref.table_name,ref.column_name) INTO found_ref USING asset_ref;
  IF found_ref THEN RETURN true;END IF;
 END LOOP;RETURN false;
END $$;
REVOKE ALL ON FUNCTION digitization_asset_has_retained_reference(uuid) FROM PUBLIC,haven_app;
CREATE FUNCTION digitization_enqueue_account_deletion() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r processing_runs;a media_assets;ar artifacts;c digitization_capture_uploads;retained boolean;
BEGIN
 IF OLD.state IS NOT DISTINCT FROM NEW.state OR NEW.state<>'deletion_requested' THEN RETURN NEW;END IF;
 -- No custom GUC can confer cleanup authority: the real account deletion row
 -- and profile transition are required in the same owning workflow.
 IF NOT EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.id) THEN RAISE EXCEPTION 'Account deletion workflow required' USING ERRCODE='42501';END IF;
 FOR r IN SELECT run.* FROM processing_runs run JOIN property_input_revisions inputs ON inputs.digitization_id=run.digitization_id AND inputs.revision=run.input_revision
 WHERE run.created_by=NEW.id OR EXISTS(SELECT 1 FROM jsonb_array_elements(inputs.source_set) s JOIN media_assets asset ON asset.id=(s->>'assetId')::uuid WHERE asset.owner_id=NEW.id AND asset.visibility='private') ORDER BY run.id FOR UPDATE OF run LOOP
  IF r.state NOT IN('ready','cancelled','cancel_requested') THEN UPDATE processing_runs SET state='cancel_requested',cancel_requested_at=coalesce(cancel_requested_at,statement_timestamp()),version=version+1 WHERE id=r.id RETURNING * INTO r;END IF;
  INSERT INTO digitization_deletion_jobs(user_id,kind,run_id,digitization_id,metadata)
  SELECT NEW.id,'stop_run',r.id,r.digitization_id,jsonb_build_object('author',jsonb_build_object('id',r.created_by,'orgId',r.organization_id,'roles',jsonb_build_array('agent')),'sources',inputs.source_set,'stages',coalesce((SELECT jsonb_agg(to_jsonb(stage)||jsonb_build_object('fencing_token',stage.fencing_token::text,'run_budget',r.budget,'deadline',least(r.deadline,coalesce(r.started_at,statement_timestamp())+(r.budget->>'maxSeconds')::integer*interval '1 second'))) FROM processing_stages stage WHERE stage.run_id=r.id),'[]'::jsonb))
  FROM property_input_revisions inputs WHERE inputs.digitization_id=r.digitization_id AND inputs.revision=r.input_revision ON CONFLICT DO NOTHING;
  FOR ar IN SELECT * FROM artifacts WHERE run_id=r.id LOOP INSERT INTO digitization_deletion_jobs(user_id,kind,digitization_id,object_key,metadata) VALUES(NEW.id,'object',ar.digitization_id,ar.object_key,jsonb_build_object('category','artifact','artifactId',ar.id)) ON CONFLICT DO NOTHING;END LOOP;
 END LOOP;
 FOR a IN SELECT asset.* FROM media_assets asset WHERE asset.owner_id=NEW.id AND asset.visibility='private' AND EXISTS(SELECT 1 FROM digitization_asset_bindings b WHERE b.asset_id=asset.id) ORDER BY asset.id FOR UPDATE LOOP
  retained:=digitization_asset_has_retained_reference(a.id);
  INSERT INTO digitization_deletion_jobs(user_id,kind,object_key,metadata,state) VALUES(NEW.id,'object','quarantine/'||a.object_key,jsonb_build_object('category','original','assetId',a.id,'retentionReason',CASE WHEN retained THEN 'non_engine_reference_requires_owning_review' ELSE NULL END),CASE WHEN retained THEN 'retained' ELSE 'pending' END) ON CONFLICT DO NOTHING;
  IF NOT retained THEN UPDATE media_assets SET status='deletion_requested',version=version+1 WHERE id=a.id;END IF;
 END LOOP;
 UPDATE digitization_evidence_grants SET state='revoked',version=version+1 WHERE owner_id=NEW.id AND state='active';
 FOR c IN SELECT * FROM digitization_capture_uploads WHERE created_by=NEW.id LOOP INSERT INTO digitization_deletion_jobs(user_id,kind,digitization_id,object_key,upload_id,metadata) VALUES(NEW.id,'object',c.digitization_id,c.object_key,c.upload_id,jsonb_build_object('category','capture','captureId',c.id)) ON CONFLICT DO NOTHING;END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER digitization_account_deletion AFTER UPDATE OF state ON profiles FOR EACH ROW EXECUTE FUNCTION digitization_enqueue_account_deletion();
CREATE FUNCTION digitization_claim_deletion_job() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE job digitization_deletion_jobs;
BEGIN
 IF actor_id() IS DISTINCT FROM '00000000-0000-4000-8000-000000000010'::uuid THEN RAISE EXCEPTION 'Trusted deletion maintenance identity required' USING ERRCODE='42501';END IF;
 SELECT * INTO job FROM digitization_deletion_jobs j WHERE j.state='pending' AND (j.lease_until IS NULL OR j.lease_until<=statement_timestamp()) AND EXISTS(SELECT 1 FROM profiles WHERE id=j.user_id AND state='deletion_requested') AND (j.kind='stop_run' OR NOT EXISTS(SELECT 1 FROM digitization_deletion_jobs stop WHERE stop.user_id=j.user_id AND stop.kind='stop_run' AND stop.state='pending')) ORDER BY CASE kind WHEN 'stop_run' THEN 0 ELSE 1 END,j.created_at,j.id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL;END IF;
 UPDATE digitization_deletion_jobs SET fence=fence+1,lease_until=statement_timestamp()+interval '60 seconds' WHERE id=job.id RETURNING * INTO job;
 RETURN to_jsonb(job)||jsonb_build_object('fence',job.fence::text);
END $$;
CREATE FUNCTION digitization_finish_deletion_job(job_ref uuid,fence_ref text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE job digitization_deletion_jobs;r processing_runs;
BEGIN
 IF actor_id() IS DISTINCT FROM '00000000-0000-4000-8000-000000000010'::uuid THEN RAISE EXCEPTION 'Trusted deletion maintenance identity required' USING ERRCODE='42501';END IF;
 SELECT * INTO job FROM digitization_deletion_jobs WHERE id=job_ref AND fence::text=fence_ref AND state='pending' AND lease_until>statement_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN false;END IF;
 IF job.kind='stop_run' THEN
  SELECT * INTO r FROM processing_runs WHERE id=job.run_id FOR UPDATE;
  IF r.state='cancel_requested' THEN
   UPDATE processing_stages SET state='cancelled',version=version+1 WHERE run_id=r.id AND state NOT IN('succeeded','failed_terminal','skipped','cancelled');
   UPDATE processing_runs SET state='cancelled',version=version+1 WHERE id=r.id;
  ELSIF r.state NOT IN('cancelled','ready') THEN RAISE EXCEPTION 'Deletion run cancellation changed' USING ERRCODE='40001';END IF;
 END IF;
 UPDATE digitization_deletion_jobs SET state='complete',completed_at=statement_timestamp(),lease_until=NULL WHERE id=job.id;RETURN true;
END $$;
REVOKE ALL ON FUNCTION digitization_claim_deletion_job(),digitization_finish_deletion_job(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION digitization_claim_deletion_job(),digitization_finish_deletion_job(uuid,text) TO haven_app;
