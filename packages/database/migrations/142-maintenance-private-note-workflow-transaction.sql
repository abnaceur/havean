-- Private notes accompany an admitted versioned workflow update, including closure.
CREATE OR REPLACE FUNCTION maintenance_private_note_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE r maintenance%ROWTYPE;l leases%ROWTYPE;root_transaction bigint;
BEGIN
 IF current_user<>'haven_app' OR management_admin() THEN RETURN NEW;END IF;
 SELECT * INTO r FROM maintenance WHERE id=NEW.request_id FOR SHARE;
 SELECT * INTO l FROM leases WHERE id=r.lease_id FOR SHARE;
 SELECT xmin::text::bigint INTO root_transaction FROM maintenance WHERE id=NEW.request_id;
 IF root_transaction IS DISTINCT FROM (pg_current_xact_id()::text::numeric % 4294967296)::bigint OR r.updated_by IS DISTINCT FROM actor_id() THEN RAISE EXCEPTION 'Private note requires the same authorized workflow transaction' USING ERRCODE='23514';END IF;
 IF r.id IS NULL OR NOT management_inviter_lock(r.organization_id) OR management_unit_grant_lock(l.unit_id,l.organization_id) IS NULL OR NEW.actor_id IS DISTINCT FROM actor_id() OR NEW.request_version<>r.version OR NEW.at IS DISTINCT FROM statement_timestamp() THEN RAISE EXCEPTION 'Current authorized request version and manager required for private note' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
