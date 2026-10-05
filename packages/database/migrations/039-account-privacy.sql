CREATE TABLE account_deletion_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL UNIQUE REFERENCES profiles,
 profile_version integer NOT NULL CHECK(profile_version>0),version integer NOT NULL DEFAULT 1 CHECK(version>0),
 status text NOT NULL DEFAULT 'requested' CHECK(status IN('requested','reviewing','completed')),
 reason text NOT NULL DEFAULT '',retention_policy_version integer NOT NULL DEFAULT 1 CHECK(retention_policy_version=1),
 created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz
);
ALTER TABLE account_deletion_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_deletion_requests ON account_deletion_requests FOR SELECT USING(user_id=actor_id() OR staff_scope());
CREATE POLICY system_deletion_requests ON account_deletion_requests FOR ALL USING(staff_scope()) WITH CHECK(staff_scope());
-- Narrow identity/engagement integration port. No financial or audit records are deleted.
CREATE FUNCTION request_own_account_deletion(expected integer, explanation text) RETURNS SETOF account_deletion_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target uuid:=actor_id(); prior_admin text:=coalesce(current_setting('app.admin',true),'false');
BEGIN
 IF target IS NULL OR expected<1 OR length(explanation)>500 THEN RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('optional-alerts:'||target::text,0));
 PERFORM 1 FROM profiles WHERE id=target AND state='active' AND version=expected FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 INSERT INTO account_deletion_requests(user_id,profile_version,reason) VALUES(target,expected,explanation);
 PERFORM set_config('app.admin','true',true);
 UPDATE profiles SET state='deletion_requested',version=version+1 WHERE id=target;
 PERFORM set_config('app.admin',prior_admin,true);
 DELETE FROM sessions WHERE user_id=target;
 UPDATE memberships SET status='inactive' WHERE user_id=target;
 UPDATE notification_preferences SET email_enabled=false,in_app_enabled=false,version=version+1 WHERE user_id=target AND (email_enabled OR in_app_enabled);
 UPDATE saved_searches SET paused=true,version=version+1,updated_at=now() WHERE user_id=target AND NOT paused AND deleted_at IS NULL;
 UPDATE alert_digests SET status='cancelled',version=version+1,error_code='ACCOUNT_DELETION_REQUESTED',updated_at=now() WHERE user_id=target AND status IN('queued','failed','processing');
 RETURN QUERY SELECT * FROM account_deletion_requests WHERE user_id=target;
END;
$$;
REVOKE ALL ON FUNCTION request_own_account_deletion(integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION request_own_account_deletion(integer,text) TO haven_app;
