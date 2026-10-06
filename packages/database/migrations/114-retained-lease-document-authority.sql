-- Keep an already authorized team attachment while editing its label; new attachments require owned files.
CREATE OR REPLACE FUNCTION lease_document_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE l leases%ROWTYPE;m media_assets%ROWTYPE;
BEGIN
 IF current_user<>'haven_app' OR management_admin() THEN IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;END IF;
 SELECT * INTO l FROM leases WHERE id=coalesce(NEW.lease_id,OLD.lease_id) FOR SHARE;
 IF l.id IS NULL OR l.status<>'draft' OR NOT management_inviter_lock(l.organization_id) OR management_unit_grant_lock(l.unit_id,l.organization_id) IS NULL THEN RAISE EXCEPTION 'Current managed draft required' USING ERRCODE='42501';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;
 IF TG_OP='UPDATE' AND (NEW.lease_id<>OLD.lease_id OR NEW.asset_id<>OLD.asset_id OR NEW.asset_version<>OLD.asset_version) THEN RAISE EXCEPTION 'Attachment identity is immutable' USING ERRCODE='42501';END IF;
 SELECT * INTO m FROM media_assets WHERE id=NEW.asset_id FOR SHARE;
 IF m.id IS NULL OR (TG_OP='INSERT' AND m.owner_id<>actor_id()) OR m.version<>NEW.asset_version OR m.status<>'approved' OR m.scan_at IS NULL OR m.visibility<>'private' OR m.purpose<>'document' OR m.mime<>'application/pdf' THEN RAISE EXCEPTION 'Approved private PDF and current version required' USING ERRCODE='42501';END IF;
 RETURN NEW;
END $$;
