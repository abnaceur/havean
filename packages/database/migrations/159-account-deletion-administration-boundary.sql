-- Own privacy deletion is retained separately from staff account administration.
-- After the profile enters deletion_requested, its actor cannot author staff activity.
CREATE OR REPLACE FUNCTION platform_administration_record() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target uuid;kind text;reason text;before_data jsonb;after_data jsonb;
BEGIN
 IF actor_id() IS NULL OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=actor_id() AND state='active') THEN RETURN NEW;END IF;
 IF TG_TABLE_NAME='profiles' THEN
  IF NEW.state IS NOT DISTINCT FROM OLD.state THEN RETURN NEW;END IF;
  target:=NEW.id;kind:=CASE WHEN NEW.state='suspended' THEN 'account.suspended' ELSE 'account.reactivated' END;reason:=current_setting('app.administration_reason',true);before_data:=jsonb_build_object('state',OLD.state,'version',OLD.version);after_data:=jsonb_build_object('state',NEW.state,'version',NEW.version);
 ELSE
  IF NEW.organization_id IS NOT NULL OR NEW.role NOT IN('moderator','support','editor','admin') THEN RETURN NEW;END IF;
  target:=NEW.user_id;kind:='staff.permission_changed';reason:=NEW.change_reason;before_data:=CASE WHEN TG_OP='UPDATE' THEN jsonb_build_object('id',OLD.id,'role',OLD.role,'status',OLD.status,'version',OLD.version) ELSE 'null'::jsonb END;after_data:=jsonb_build_object('id',NEW.id,'role',NEW.role,'status',NEW.status,'version',NEW.version);
 END IF;
 INSERT INTO platform_administration_history(target_id,kind,actor_id,reason,before_snapshot,after_snapshot) VALUES(target,kind,actor_id(),reason,before_data,after_data);
 DELETE FROM sessions WHERE user_id=target;
 INSERT INTO audit_events(actor_id,resource_id,action) VALUES(actor_id(),target,kind);
 INSERT INTO outbox(aggregate_id,kind,payload) VALUES(target,kind,jsonb_build_object('version',NEW.version));RETURN NEW;
END $$;

-- Account deletion also disables the independently consented history collection.
CREATE OR REPLACE FUNCTION request_own_account_deletion(expected integer, explanation text) RETURNS SETOF account_deletion_requests
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
 UPDATE memberships SET status='inactive',version=version+1 WHERE user_id=target AND status<>'inactive';
 UPDATE notification_preferences SET email_enabled=false,in_app_enabled=false,version=version+1 WHERE user_id=target AND (email_enabled OR in_app_enabled);
 UPDATE browsing_history_settings SET enabled=false,version=version+1 WHERE user_id=target AND enabled;
 UPDATE analytics_consent SET enabled=false,version=version+1,updated_at=statement_timestamp() WHERE user_id=target AND enabled;
 UPDATE saved_searches SET paused=true,version=version+1,updated_at=now() WHERE user_id=target AND NOT paused AND deleted_at IS NULL;
 UPDATE alert_digests SET status='cancelled',version=version+1,error_code='ACCOUNT_DELETION_REQUESTED',updated_at=now() WHERE user_id=target AND status IN('queued','failed');
 RETURN QUERY SELECT * FROM account_deletion_requests WHERE user_id=target;
END;
$$;
