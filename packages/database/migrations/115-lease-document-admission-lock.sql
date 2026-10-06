CREATE FUNCTION lease_document_asset_lock(target uuid) RETURNS SETOF media_assets LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN RETURN QUERY SELECT a.* FROM media_assets a WHERE a.id=target AND (a.owner_id=actor_id() OR lease_document_asset_grant(target)) FOR SHARE OF a;END $$;
REVOKE ALL ON FUNCTION lease_document_asset_lock(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lease_document_asset_lock(uuid) TO haven_app;
CREATE OR REPLACE FUNCTION lease_document_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE l leases%ROWTYPE;m media_assets%ROWTYPE;
BEGIN
 IF current_user<>'haven_app' OR management_admin() THEN IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;END IF;
 SELECT * INTO l FROM leases WHERE id=coalesce(NEW.lease_id,OLD.lease_id) FOR SHARE;
 IF l.id IS NULL OR l.status<>'draft' OR NOT management_inviter_lock(l.organization_id) OR management_unit_grant_lock(l.unit_id,l.organization_id) IS NULL THEN RAISE EXCEPTION 'Current managed draft required' USING ERRCODE='42501';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;
 IF TG_OP='UPDATE' AND (NEW.lease_id<>OLD.lease_id OR NEW.asset_id<>OLD.asset_id OR NEW.asset_version<>OLD.asset_version) THEN RAISE EXCEPTION 'Attachment identity is immutable' USING ERRCODE='42501';END IF;
 SELECT * INTO m FROM lease_document_asset_lock(NEW.asset_id);
 IF m.id IS NULL OR (TG_OP='INSERT' AND m.owner_id<>actor_id()) OR m.version<>NEW.asset_version OR m.status<>'approved' OR m.scan_at IS NULL OR m.visibility<>'private' OR m.purpose<>'document' OR m.mime<>'application/pdf' THEN RAISE EXCEPTION 'Approved private PDF and current version required' USING ERRCODE='42501';END IF;
 RETURN NEW;
END $$;
