CREATE OR REPLACE FUNCTION maintenance_private_photo(target uuid,asset uuid) RETURNS TABLE(id uuid,version int,display_key text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r maintenance%ROWTYPE;l leases%ROWTYPE;
BEGIN
 SELECT * INTO r FROM maintenance WHERE maintenance.id=target FOR SHARE;
 IF r.id IS NULL THEN RETURN;END IF;
 IF maintenance_manager(r.organization_id) THEN
 IF NOT management_inviter_lock(r.organization_id) THEN RETURN;END IF;
 SELECT * INTO l FROM leases WHERE leases.id=r.lease_id FOR SHARE;
 IF management_unit_grant_lock(l.unit_id,l.organization_id) IS NULL THEN RETURN;END IF;
 ELSIF r.user_id<>actor_id() OR NOT tenant_lease_lock(r.lease_id) THEN RETURN;
 END IF;
 RETURN QUERY SELECT a.id,a.version,a.variants->>'display' FROM maintenance_photos p JOIN media_assets a ON a.id=p.asset_id AND a.version=p.asset_version WHERE p.request_id=target AND p.asset_id=asset AND a.status='approved' AND a.scan_at IS NOT NULL AND a.visibility='private' AND a.purpose='photo' FOR SHARE OF p,a;
END $$;
CREATE FUNCTION maintenance_private_note_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE r maintenance%ROWTYPE;l leases%ROWTYPE;
BEGIN
 IF current_user<>'haven_app' OR management_admin() THEN RETURN NEW;END IF;
 SELECT * INTO r FROM maintenance WHERE id=NEW.request_id FOR SHARE;
 SELECT * INTO l FROM leases WHERE id=r.lease_id FOR SHARE;
 IF r.id IS NULL OR NOT management_inviter_lock(r.organization_id) OR management_unit_grant_lock(l.unit_id,l.organization_id) IS NULL OR NEW.actor_id IS DISTINCT FROM actor_id() OR NEW.request_version<>r.version OR NEW.at IS DISTINCT FROM statement_timestamp() THEN RAISE EXCEPTION 'Current authorized request version and manager required for private note' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER maintenance_private_note_guard BEFORE INSERT ON maintenance_internal_notes FOR EACH ROW EXECUTE FUNCTION maintenance_private_note_guard();
