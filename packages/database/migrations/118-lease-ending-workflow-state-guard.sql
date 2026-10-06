CREATE FUNCTION lease_ending_state_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF current_user<>'haven_app' OR management_admin() THEN RETURN NEW;END IF;
 IF NEW.status IS DISTINCT FROM OLD.status THEN
 IF OLD.status='ended' OR (OLD.status='active' AND NEW.status<>'ended') OR (OLD.status='draft' AND NEW.status<>'active') THEN RAISE EXCEPTION 'Lease workflow state transition denied' USING ERRCODE='23514';END IF;
 IF NEW.status='ended' AND NOT EXISTS(SELECT 1 FROM lease_endings e WHERE e.lease_id=NEW.id AND e.version=NEW.version AND e.actor_id=actor_id()) THEN RAISE EXCEPTION 'Versioned ending reason and availability review required' USING ERRCODE='23514';END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER lease_ending_state_guard BEFORE UPDATE ON leases FOR EACH ROW EXECUTE FUNCTION lease_ending_state_guard();
