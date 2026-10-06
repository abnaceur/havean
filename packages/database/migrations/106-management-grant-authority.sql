ALTER TABLE management_grants ADD COLUMN version int NOT NULL DEFAULT 1 CHECK(version>0),ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK(status IN('active','revoked')),ADD COLUMN starts_at timestamptz,ADD COLUMN owner_authority_id uuid REFERENCES owner_unit_grants,ADD COLUMN owner_authority_version int,ADD COLUMN unit_snapshot jsonb,ADD COLUMN consent_at timestamptz,ADD COLUMN created_at timestamptz,ADD COLUMN updated_at timestamptz;
ALTER TABLE management_grants ADD CONSTRAINT native_management_authority CHECK(owner_authority_id IS NULL OR (owner_authority_version>0 AND starts_at IS NOT NULL AND unit_snapshot IS NOT NULL AND consent_at IS NOT NULL AND starts_at<expires_at));
-- Inventory-owned bounded read/lock ports: no owner-authority table mutation.
CREATE FUNCTION owner_management_authority_valid(target uuid,owner uuid,authority uuid,authority_version int) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM owner_unit_grants g WHERE g.unit_id=target AND g.owner_id=owner AND g.status='active' AND (g.expires_at IS NULL OR g.expires_at>statement_timestamp()) AND g.id=authority AND g.version=authority_version) $$;
CREATE FUNCTION owner_management_unit(target uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE authority record; snapshot jsonb;
BEGIN
 SELECT * INTO authority FROM current_owner_unit_grant(target); IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT jsonb_build_object('id',u.id,'version',u.version,'ownerGrantId',authority.id,'ownerGrantVersion',authority.version,'community',co.name,'city',ci.slug,'currency',ci.currency,'area',u.area::text,'beds',u.beds) INTO snapshot FROM units u JOIN communities co ON co.id=u.community_id JOIN districts d ON d.id=co.district_id JOIN cities ci ON ci.id=d.city_id WHERE u.id=target FOR SHARE OF u;
 RETURN snapshot;
END $$;
CREATE FUNCTION management_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM profiles p JOIN memberships m ON m.user_id=p.id WHERE p.id=actor_id() AND p.state='active' AND m.status='active' AND m.role='admin') $$;
CREATE FUNCTION management_team(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM profiles p JOIN memberships m ON m.user_id=p.id JOIN organizations o ON o.id=m.organization_id WHERE p.id=actor_id() AND p.state='active' AND m.status='active' AND m.role IN('property_manager','finance') AND m.organization_id=target AND target=org_id() AND o.type='management') $$;
CREATE FUNCTION management_destination(target uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE label text;
BEGIN
 SELECT o.name INTO label FROM organizations o JOIN memberships m ON m.organization_id=o.id JOIN profiles p ON p.id=m.user_id WHERE o.id=target AND o.type='management' AND m.status='active' AND m.role='property_manager' AND p.state='active' ORDER BY p.id LIMIT 1 FOR SHARE OF o,m,p;
 RETURN label;
END $$;
CREATE FUNCTION management_grant_valid(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM management_grants g WHERE g.id=target AND g.status='active' AND g.expires_at>statement_timestamp() AND (g.starts_at IS NULL OR g.starts_at<=statement_timestamp()) AND (g.owner_authority_id IS NULL OR owner_management_authority_valid(g.unit_id,g.owner_id,g.owner_authority_id,g.owner_authority_version))) $$;
CREATE FUNCTION management_unit_granted(target uuid,organization uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT (management_team(organization) OR management_admin()) AND EXISTS(SELECT 1 FROM management_grants g WHERE g.unit_id=target AND g.organization_id=organization AND management_grant_valid(g.id)) $$;
REVOKE ALL ON FUNCTION owner_management_authority_valid(uuid,uuid,uuid,int),owner_management_unit(uuid),management_admin(),management_team(uuid),management_destination(uuid),management_grant_valid(uuid),management_unit_granted(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION owner_management_authority_valid(uuid,uuid,uuid,int),owner_management_unit(uuid),management_admin(),management_team(uuid),management_destination(uuid),management_grant_valid(uuid),management_unit_granted(uuid,uuid) TO haven_app;
DROP POLICY org_scope ON management_grants;
DROP POLICY owner_grants ON management_grants;
CREATE POLICY management_grant_read ON management_grants FOR SELECT USING(owner_id=actor_id() OR management_admin() OR management_team(organization_id) AND management_grant_valid(id));
CREATE POLICY management_grant_insert ON management_grants FOR INSERT WITH CHECK(owner_id=actor_id() OR management_admin());
CREATE POLICY management_grant_update ON management_grants FOR UPDATE USING(owner_id=actor_id() OR management_admin()) WITH CHECK(owner_id=actor_id() OR management_admin());
CREATE POLICY management_grant_retention ON management_grants FOR DELETE USING(management_admin());
CREATE TABLE management_grant_activity(grant_id uuid NOT NULL REFERENCES management_grants,grant_version int NOT NULL CHECK(grant_version>0),action text NOT NULL CHECK(action IN('granted','renewed','revoked')),note text NOT NULL CHECK(length(note) BETWEEN 5 AND 500),actor_id uuid NOT NULL REFERENCES profiles,at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(grant_id,grant_version));
ALTER TABLE management_grant_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY management_grant_activity_read ON management_grant_activity FOR SELECT USING(EXISTS(SELECT 1 FROM management_grants g WHERE g.id=grant_id));
CREATE POLICY management_grant_activity_insert ON management_grant_activity FOR INSERT WITH CHECK(actor_id=public.actor_id() AND EXISTS(SELECT 1 FROM management_grants g WHERE g.id=grant_id AND g.owner_id=public.actor_id()));
CREATE FUNCTION management_grant_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE snapshot jsonb;
BEGIN
 IF current_user<>'haven_app' OR management_admin() THEN RETURN NEW; END IF;
 IF NEW.owner_id<>actor_id() OR NOT EXISTS(SELECT 1 FROM profiles p JOIN memberships m ON m.user_id=p.id WHERE p.id=actor_id() AND p.state='active' AND m.status='active' AND m.role='owner') THEN RAISE EXCEPTION 'Actual owner authority required' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' THEN
 IF (NEW.id,NEW.unit_id,NEW.organization_id,NEW.owner_id,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.unit_id,OLD.organization_id,OLD.owner_id,OLD.created_at) OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Grant identity and version are immutable' USING ERRCODE='23514'; END IF;
 IF NEW.status='revoked' THEN
 IF OLD.status<>'active' OR (to_jsonb(NEW)-ARRAY['status','version','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','updated_at']) THEN RAISE EXCEPTION 'Invalid revocation' USING ERRCODE='23514'; END IF; NEW.updated_at=now(); RETURN NEW;
 END IF;
 ELSIF NEW.version<>1 THEN RAISE EXCEPTION 'New grant version must be one' USING ERRCODE='23514'; END IF;
 snapshot=owner_management_unit(NEW.unit_id);
 IF snapshot IS NULL OR NEW.status<>'active' OR NEW.owner_authority_id IS DISTINCT FROM (snapshot->>'ownerGrantId')::uuid OR NEW.owner_authority_version IS DISTINCT FROM (snapshot->>'ownerGrantVersion')::int OR NEW.unit_snapshot IS DISTINCT FROM snapshot OR NEW.consent_at IS DISTINCT FROM now() OR NEW.starts_at IS DISTINCT FROM now() OR NOT isfinite(NEW.expires_at) OR NEW.expires_at<=statement_timestamp() OR management_destination(NEW.organization_id) IS NULL THEN RAISE EXCEPTION 'Current unit/owner authority, consent and finite future expiry required' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN NEW.created_at=now(); ELSE NEW.created_at=OLD.created_at; END IF;NEW.updated_at=now();RETURN NEW;
END $$;
CREATE TRIGGER management_grant_guard BEFORE INSERT OR UPDATE ON management_grants FOR EACH ROW EXECUTE FUNCTION management_grant_guard();
CREATE FUNCTION management_grant_activity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE g management_grants%ROWTYPE;
BEGIN
 IF current_user<>'haven_app' THEN RETURN NEW; END IF;
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Grant activity is immutable' USING ERRCODE='23514'; END IF;
 SELECT * INTO g FROM management_grants WHERE id=NEW.grant_id;
 IF NOT FOUND OR NEW.actor_id<>actor_id() OR g.owner_id<>actor_id() OR g.updated_at IS DISTINCT FROM now() OR NEW.grant_version<>g.version OR (NEW.action='granted')<>(g.version=1) OR (NEW.action='revoked')<>(g.status='revoked') THEN RAISE EXCEPTION 'Invalid grant activity' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER management_grant_activity_guard BEFORE INSERT OR UPDATE OR DELETE ON management_grant_activity FOR EACH ROW EXECUTE FUNCTION management_grant_activity_guard();
GRANT SELECT,INSERT ON management_grant_activity TO haven_app;

CREATE FUNCTION management_owner_label(target uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT p.display_name FROM management_grants g JOIN profiles p ON p.id=g.owner_id WHERE g.id=target AND (g.owner_id=actor_id() OR management_admin() OR management_team(g.organization_id) AND management_grant_valid(g.id)) $$;
REVOKE ALL ON FUNCTION management_owner_label(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION management_owner_label(uuid) TO haven_app;
-- Management-owned mutation admission locks grant and current actor/source authority.
CREATE FUNCTION management_unit_grant_lock(target uuid,organization uuid) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE source management_grants%ROWTYPE;
BEGIN
 PERFORM 1 FROM profiles p JOIN memberships m ON m.user_id=p.id WHERE p.id=actor_id() AND p.state='active' AND m.status='active' AND (m.role='admin' OR m.organization_id=organization AND organization=org_id() AND m.role IN('property_manager','finance')) ORDER BY m.id LIMIT 1 FOR SHARE OF p,m;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT g.* INTO source FROM management_grants g JOIN organizations o ON o.id=g.organization_id AND o.type='management' WHERE g.unit_id=target AND g.organization_id=organization AND management_grant_valid(g.id) FOR SHARE OF g;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF source.owner_authority_id IS NOT NULL THEN
 PERFORM 1 FROM owner_unit_grants a WHERE a.id=source.owner_authority_id AND a.version=source.owner_authority_version AND a.owner_id=source.owner_id AND a.unit_id=source.unit_id AND a.status='active' AND (a.expires_at IS NULL OR a.expires_at>statement_timestamp()) FOR SHARE OF a;
 IF NOT FOUND THEN RETURN NULL; END IF;
 END IF;
 RETURN source.version;
END $$;
REVOKE ALL ON FUNCTION management_unit_grant_lock(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION management_unit_grant_lock(uuid,uuid) TO haven_app;
