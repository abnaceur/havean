CREATE FUNCTION platform_admin_lock() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN PERFORM 1 FROM profiles WHERE id=actor_id() AND state='active' FOR SHARE;IF NOT FOUND THEN RETURN false;END IF;PERFORM 1 FROM memberships WHERE user_id=actor_id() AND organization_id IS NULL AND status='active' AND role='admin' FOR SHARE;RETURN FOUND;END $$;
CREATE UNIQUE INDEX platform_staff_role_unique ON memberships(user_id,role) WHERE organization_id IS NULL AND role IN('moderator','support','editor','admin');
CREATE TABLE platform_administration_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),target_id uuid NOT NULL REFERENCES profiles,kind text NOT NULL CHECK(kind IN('account.suspended','account.reactivated','staff.permission_changed')),actor_id uuid NOT NULL REFERENCES profiles,at timestamptz NOT NULL DEFAULT statement_timestamp(),reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 10 AND 1000),before_snapshot jsonb NOT NULL,after_snapshot jsonb NOT NULL);
ALTER TABLE platform_administration_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY platform_administration_history_read ON platform_administration_history FOR SELECT USING(support_admin_actor(actor_id()));
CREATE TRIGGER platform_administration_history_immutable BEFORE UPDATE OR DELETE ON platform_administration_history FOR EACH ROW EXECUTE FUNCTION lease_history_guard();
CREATE FUNCTION platform_profile_state_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$ BEGIN
 IF current_user<>'haven_app' OR NEW.state IS NOT DISTINCT FROM OLD.state THEN RETURN NEW;END IF;
 IF NOT platform_admin_lock() OR OLD.id=actor_id() OR NEW.version<>OLD.version+1 OR NEW.state NOT IN('active','suspended') OR length(coalesce(btrim(current_setting('app.administration_reason',true)),'')) NOT BETWEEN 10 AND 1000 OR (to_jsonb(NEW)-ARRAY['state','version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version']) THEN RAISE EXCEPTION 'Current administrator, target version and recorded state reason required' USING ERRCODE='23514';END IF;RETURN NEW;
END $$;
CREATE TRIGGER platform_profile_state_admission BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION platform_profile_state_guard();
CREATE FUNCTION platform_staff_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$ BEGIN
 IF current_user<>'haven_app' THEN IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;END IF;
 IF TG_OP='DELETE' THEN
  IF OLD.organization_id IS NULL AND OLD.role IN('moderator','support','editor','admin') THEN RAISE EXCEPTION 'Retain staff permission history; revoke instead' USING ERRCODE='23514';END IF;RETURN OLD;
 END IF;
 IF NEW.organization_id IS NULL AND NEW.role IN('moderator','support','editor','admin') OR TG_OP='UPDATE' AND OLD.organization_id IS NULL AND OLD.role IN('moderator','support','editor','admin') THEN
  IF NOT platform_admin_lock() OR NEW.user_id=actor_id() OR NEW.organization_id IS NOT NULL OR NEW.role NOT IN('moderator','support','editor','admin') OR NEW.status NOT IN('active','revoked') OR length(btrim(NEW.change_reason)) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'Actual administrator and other-user staff permission required' USING ERRCODE='23514';END IF;
  PERFORM 1 FROM profiles WHERE id=NEW.user_id AND state='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active staff target required' USING ERRCODE='23514';END IF;
  IF TG_OP='INSERT' AND (NEW.version<>1 OR NEW.status<>'active') OR TG_OP='UPDATE' AND (NEW.version<>OLD.version+1 OR NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS NOT DISTINCT FROM OLD.status) THEN RAISE EXCEPTION 'Exact versioned original staff permission required' USING ERRCODE='23514';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER platform_staff_admission BEFORE INSERT OR UPDATE OR DELETE ON memberships FOR EACH ROW EXECUTE FUNCTION platform_staff_guard();
CREATE FUNCTION platform_administration_record() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target uuid;kind text;reason text;before_data jsonb;after_data jsonb;
BEGIN
 IF actor_id() IS NULL THEN RETURN NEW;END IF;
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
CREATE TRIGGER platform_account_activity AFTER UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION platform_administration_record();
CREATE TRIGGER platform_staff_activity AFTER INSERT OR UPDATE ON memberships FOR EACH ROW EXECUTE FUNCTION platform_administration_record();
REVOKE ALL ON FUNCTION platform_admin_lock() FROM PUBLIC;GRANT EXECUTE ON FUNCTION platform_admin_lock() TO haven_app;
