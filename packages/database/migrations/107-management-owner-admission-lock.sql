-- Preserve applied SQL 106. Serialize actor changes and check source expiry at mutation time.
CREATE FUNCTION management_owner_lock() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM 1 FROM profiles p JOIN memberships m ON m.user_id=p.id WHERE p.id=actor_id() AND p.state='active' AND m.status='active' AND m.role='owner' ORDER BY m.id LIMIT 1 FOR SHARE OF p,m;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION management_owner_lock() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION management_owner_lock() TO haven_app;
CREATE OR REPLACE FUNCTION management_grant_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE snapshot jsonb;
BEGIN
 IF current_user<>'haven_app' OR management_admin() THEN RETURN NEW; END IF;
 IF NEW.owner_id<>actor_id() OR NOT management_owner_lock() THEN RAISE EXCEPTION 'Actual owner authority required' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' THEN
 IF (NEW.id,NEW.unit_id,NEW.organization_id,NEW.owner_id,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.unit_id,OLD.organization_id,OLD.owner_id,OLD.created_at) OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Grant identity and version are immutable' USING ERRCODE='23514'; END IF;
 IF NEW.status='revoked' THEN
 IF OLD.status<>'active' OR (to_jsonb(NEW)-ARRAY['status','version','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','updated_at']) THEN RAISE EXCEPTION 'Invalid revocation' USING ERRCODE='23514'; END IF; NEW.updated_at=now(); RETURN NEW;
 END IF;
 ELSIF NEW.version<>1 THEN RAISE EXCEPTION 'New grant version must be one' USING ERRCODE='23514'; END IF;
 snapshot=owner_management_unit(NEW.unit_id);
 IF snapshot IS NULL OR NEW.status<>'active' OR NEW.owner_authority_id IS DISTINCT FROM (snapshot->>'ownerGrantId')::uuid OR NEW.owner_authority_version IS DISTINCT FROM (snapshot->>'ownerGrantVersion')::int OR NOT owner_management_authority_valid(NEW.unit_id,NEW.owner_id,NEW.owner_authority_id,NEW.owner_authority_version) OR NEW.unit_snapshot IS DISTINCT FROM snapshot OR NEW.consent_at IS DISTINCT FROM now() OR NEW.starts_at IS DISTINCT FROM now() OR NOT isfinite(NEW.expires_at) OR NEW.expires_at<=statement_timestamp() OR management_destination(NEW.organization_id) IS NULL THEN RAISE EXCEPTION 'Current unit/owner authority, consent and finite future expiry required' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN NEW.created_at=now(); ELSE NEW.created_at=OLD.created_at; END IF;NEW.updated_at=now();RETURN NEW;
END $$;
