CREATE TABLE digitization_capture_uploads(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),digitization_id uuid NOT NULL REFERENCES property_digitizations,organization_id uuid REFERENCES organizations,created_by uuid NOT NULL REFERENCES profiles,
 object_key text NOT NULL UNIQUE CHECK(object_key='capture/'||id::text),upload_id text,
 mime text NOT NULL CHECK(mime IN('video/mp4','video/quicktime')),expected_bytes bigint NOT NULL CHECK(expected_bytes BETWEEN 1 AND 2147483648),rights text NOT NULL CHECK(length(rights) BETWEEN 5 AND 300),
 state text NOT NULL DEFAULT 'provisioning' CHECK(state IN('provisioning','uploading','cancel_requested','cancelled','expired','complete')),version int NOT NULL DEFAULT 1 CHECK(version>0),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,digitization_id),CHECK(state NOT IN('uploading','complete') OR upload_id IS NOT NULL)
);
ALTER TABLE digitization_capture_uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY capture_read ON digitization_capture_uploads FOR SELECT USING(created_by=actor_id() AND digitization_target_access(digitization_id));
CREATE POLICY capture_create ON digitization_capture_uploads FOR INSERT WITH CHECK(created_by=actor_id() AND digitization_target_access(digitization_id));
CREATE POLICY capture_update ON digitization_capture_uploads FOR UPDATE USING(created_by=actor_id() AND digitization_target_access(digitization_id)) WITH CHECK(created_by=actor_id() AND digitization_target_access(digitization_id));
CREATE FUNCTION digitization_capture_quota(engine uuid,bytes bigint) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT bytes>0 AND bytes<=2147483648 AND digitization_target_access(engine) AND (SELECT coalesce(sum(expected_bytes),0) FROM digitization_capture_uploads WHERE digitization_id=engine AND state NOT IN('cancelled','expired'))+bytes<=21474836480 $$;
CREATE FUNCTION digitization_capture_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE parent property_digitizations;
BEGIN
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
CREATE TRIGGER capture_guard BEFORE INSERT OR UPDATE ON digitization_capture_uploads FOR EACH ROW EXECUTE FUNCTION digitization_capture_guard();
CREATE INDEX capture_upload_expiry ON digitization_capture_uploads(expires_at) WHERE state IN('provisioning','uploading','cancel_requested');
