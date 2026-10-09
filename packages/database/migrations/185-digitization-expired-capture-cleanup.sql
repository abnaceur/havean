CREATE OR REPLACE FUNCTION digitization_capture_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE parent property_digitizations;
BEGIN

 IF TG_OP='UPDATE' AND actor_id()='00000000-0000-4000-8000-000000000010'::uuid AND NEW.state='expired' AND OLD.state IN('provisioning','uploading','cancel_requested') AND OLD.expires_at<=statement_timestamp() AND NEW.version=OLD.version+1 AND
  (to_jsonb(NEW)-ARRAY['state','version','updated_at'])=(to_jsonb(OLD)-ARRAY['state','version','updated_at']) THEN
  NEW.updated_at=statement_timestamp();RETURN NEW;
 END IF;
 SELECT * INTO parent FROM property_digitizations WHERE id=NEW.digitization_id FOR UPDATE;
 IF NOT digitization_target_access(NEW.digitization_id) OR parent.id IS NULL OR parent.organization_id IS DISTINCT FROM NEW.organization_id OR parent.state<>'active' THEN RAISE EXCEPTION 'Current matching capture target required' USING ERRCODE='42501';END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.created_by<>actor_id() OR NEW.version<>1 OR NEW.state<>'provisioning' OR NEW.upload_id IS NOT NULL OR NEW.expires_at>now()+interval '24 hours' OR NEW.expires_at<=now() THEN RAISE EXCEPTION 'Initial bounded capture required' USING ERRCODE='23514';END IF;
  IF (SELECT coalesce(sum(expected_bytes),0) FROM digitization_capture_uploads WHERE digitization_id=NEW.digitization_id AND state NOT IN('cancelled','expired'))+NEW.expected_bytes>21474836480 THEN RAISE EXCEPTION 'Property capture quota exceeded' USING ERRCODE='23514';END IF;
 ELSE
  IF NEW.id<>OLD.id OR NEW.digitization_id<>OLD.digitization_id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.created_by<>OLD.created_by OR NEW.object_key<>OLD.object_key OR NEW.mime<>OLD.mime OR NEW.expected_bytes<>OLD.expected_bytes OR NEW.rights<>OLD.rights OR NEW.expires_at<>OLD.expires_at OR NEW.created_at<>OLD.created_at OR NEW.version<>OLD.version+1 OR OLD.upload_id IS NOT NULL AND NEW.upload_id IS DISTINCT FROM OLD.upload_id THEN RAISE EXCEPTION 'Immutable capture identity and current version required' USING ERRCODE='23514';END IF;
  IF NOT ((OLD.state='provisioning' AND NEW.state IN('uploading','cancel_requested','expired')) OR (OLD.state='uploading' AND NEW.state IN('cancel_requested','complete','expired')) OR (OLD.state='cancel_requested' AND NEW.state='cancelled')) THEN RAISE EXCEPTION 'Invalid capture transition' USING ERRCODE='23514';END IF;
 END IF;
 NEW.updated_at=now();RETURN NEW;
END $$;

CREATE TABLE digitization_capture_cleanup_jobs(
 capture_id uuid PRIMARY KEY REFERENCES digitization_capture_uploads,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','complete')),
 fencing_token bigint NOT NULL DEFAULT 0 CHECK(fencing_token>=0),lease_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,
 CHECK((state='complete')=(completed_at IS NOT NULL))
);
ALTER TABLE digitization_capture_cleanup_jobs ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION digitization_claim_capture_cleanup() RETURNS TABLE(capture_id uuid,digitization_id uuid,object_key text,upload_id text,fencing_token text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE expired digitization_capture_uploads;job digitization_capture_cleanup_jobs;
BEGIN
 IF actor_id() IS DISTINCT FROM '00000000-0000-4000-8000-000000000010'::uuid THEN RAISE EXCEPTION 'Trusted cleanup identity required' USING ERRCODE='42501';END IF;
 SELECT * INTO expired FROM digitization_capture_uploads c WHERE c.state IN('provisioning','uploading','cancel_requested') AND c.expires_at<=statement_timestamp() ORDER BY c.expires_at,c.id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF FOUND THEN
  UPDATE digitization_capture_uploads c SET state='expired',version=c.version+1 WHERE c.id=expired.id;
  INSERT INTO digitization_capture_cleanup_jobs(capture_id) VALUES(expired.id) ON CONFLICT DO NOTHING;
 END IF;
 SELECT * INTO job FROM digitization_capture_cleanup_jobs j WHERE j.state='pending' AND (j.lease_until IS NULL OR j.lease_until<=statement_timestamp()) ORDER BY j.created_at,j.capture_id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN;END IF;
 UPDATE digitization_capture_cleanup_jobs j SET fencing_token=j.fencing_token+1,lease_until=statement_timestamp()+interval '60 seconds' WHERE j.capture_id=job.capture_id RETURNING * INTO job;
 RETURN QUERY SELECT c.id,c.digitization_id,c.object_key,c.upload_id,job.fencing_token::text FROM digitization_capture_uploads c WHERE c.id=job.capture_id AND c.state='expired';
END $$;
CREATE FUNCTION digitization_finish_capture_cleanup(capture_ref uuid,fence_ref text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF actor_id() IS DISTINCT FROM '00000000-0000-4000-8000-000000000010'::uuid THEN RAISE EXCEPTION 'Trusted cleanup identity required' USING ERRCODE='42501';END IF;
 UPDATE digitization_capture_cleanup_jobs j SET state='complete',completed_at=statement_timestamp(),lease_until=NULL WHERE j.capture_id=capture_ref AND j.fencing_token::text=fence_ref AND j.state='pending' AND j.lease_until>statement_timestamp() AND EXISTS(SELECT 1 FROM digitization_capture_uploads c WHERE c.id=capture_ref AND c.state='expired');
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION digitization_claim_capture_cleanup() FROM PUBLIC;
REVOKE ALL ON FUNCTION digitization_finish_capture_cleanup(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION digitization_claim_capture_cleanup(),digitization_finish_capture_cleanup(uuid,text) TO haven_app;
