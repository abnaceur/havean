ALTER TABLE maintenance ADD COLUMN opened_by uuid REFERENCES profiles,ADD COLUMN lease_version int,ADD COLUMN unit_version int,ADD COLUMN grant_version int,ADD COLUMN assignee_id uuid REFERENCES profiles,ADD COLUMN updated_by uuid REFERENCES profiles,ADD COLUMN updated_at timestamptz;
ALTER TABLE maintenance ALTER COLUMN created_at SET DEFAULT statement_timestamp();
CREATE TABLE maintenance_photos(request_id uuid NOT NULL REFERENCES maintenance,asset_id uuid NOT NULL REFERENCES media_assets,asset_version int NOT NULL CHECK(asset_version>0),caption text NOT NULL CHECK(length(caption) BETWEEN 2 AND 120),actor_id uuid NOT NULL REFERENCES profiles,PRIMARY KEY(request_id,asset_id));
CREATE TABLE maintenance_history(request_id uuid NOT NULL REFERENCES maintenance,version int NOT NULL CHECK(version>0),status text NOT NULL,public_note text,assignee_id uuid REFERENCES profiles,actor_id uuid NOT NULL REFERENCES profiles,at timestamptz NOT NULL DEFAULT statement_timestamp(),PRIMARY KEY(request_id,version));
CREATE TABLE maintenance_internal_notes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),request_id uuid NOT NULL REFERENCES maintenance,request_version int NOT NULL CHECK(request_version>0),body text NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 2000),actor_id uuid NOT NULL REFERENCES profiles,at timestamptz NOT NULL DEFAULT statement_timestamp());
CREATE FUNCTION maintenance_manager(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM profiles p JOIN memberships m ON m.user_id=p.id JOIN organizations o ON o.id=m.organization_id WHERE p.id=actor_id() AND p.state='active' AND m.status='active' AND m.role='property_manager' AND m.organization_id=target AND target=org_id() AND o.type='manager') $$;
CREATE FUNCTION maintenance_scope(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM maintenance r JOIN leases l ON l.id=r.lease_id WHERE r.id=target AND (management_admin() OR r.user_id=actor_id() AND tenant_lease_access(l.id) OR maintenance_manager(r.organization_id) AND management_unit_granted(l.unit_id,l.organization_id))) $$;
CREATE FUNCTION tenant_maintenance_source(target uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE l leases%ROWTYPE;u units%ROWTYPE;g management_grants%ROWTYPE;result jsonb;
BEGIN
 IF NOT tenant_lease_lock(target) THEN RETURN NULL;END IF;
 SELECT * INTO l FROM leases WHERE id=target AND status='active';IF l.id IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO g FROM management_grants WHERE unit_id=l.unit_id AND organization_id=l.organization_id AND management_grant_valid(id) ORDER BY id LIMIT 1 FOR SHARE;IF g.id IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO u FROM units WHERE id=l.unit_id FOR SHARE;
 SELECT jsonb_build_object('leaseId',l.id,'leaseVersion',l.version,'unitId',u.id,'unitVersion',u.version,'grantVersion',g.version,'organizationId',l.organization_id,'userId',actor_id(),'community',co.name) INTO result FROM communities co WHERE co.id=u.community_id;
 RETURN result;
END $$;
CREATE POLICY maintenance_current_scope ON maintenance AS RESTRICTIVE USING(maintenance_scope(id)) WITH CHECK(management_admin() OR maintenance_manager(organization_id) AND EXISTS(SELECT 1 FROM leases l WHERE l.id=lease_id AND management_unit_granted(l.unit_id,l.organization_id)) OR user_id=actor_id() AND tenant_lease_access(lease_id));
ALTER TABLE maintenance_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_internal_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY maintenance_photos_read ON maintenance_photos FOR SELECT USING(maintenance_scope(request_id));
CREATE POLICY maintenance_photos_append ON maintenance_photos FOR INSERT WITH CHECK(actor_id=actor_id() AND maintenance_scope(request_id));
CREATE POLICY maintenance_history_read ON maintenance_history FOR SELECT USING(maintenance_scope(request_id));
CREATE POLICY maintenance_history_append ON maintenance_history FOR INSERT WITH CHECK(actor_id=actor_id() AND maintenance_scope(request_id));
CREATE POLICY maintenance_internal_read ON maintenance_internal_notes FOR SELECT USING(maintenance_manager((SELECT organization_id FROM maintenance WHERE id=request_id)) AND maintenance_scope(request_id));
CREATE POLICY maintenance_internal_append ON maintenance_internal_notes FOR INSERT WITH CHECK(actor_id=actor_id() AND maintenance_manager((SELECT organization_id FROM maintenance WHERE id=request_id)) AND maintenance_scope(request_id));
CREATE TRIGGER maintenance_photos_immutable BEFORE UPDATE OR DELETE ON maintenance_photos FOR EACH ROW EXECUTE FUNCTION lease_history_guard();
CREATE TRIGGER maintenance_history_immutable BEFORE UPDATE OR DELETE ON maintenance_history FOR EACH ROW EXECUTE FUNCTION lease_history_guard();
CREATE TRIGGER maintenance_internal_immutable BEFORE UPDATE OR DELETE ON maintenance_internal_notes FOR EACH ROW EXECUTE FUNCTION lease_history_guard();
CREATE FUNCTION maintenance_request_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE l leases%ROWTYPE;u jsonb;g int;tenant_source jsonb;assigned boolean;
BEGIN
 IF current_user<>'haven_app' OR management_admin() THEN IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Maintenance history is retained' USING ERRCODE='42501';END IF;
 SELECT * INTO l FROM leases WHERE id=NEW.lease_id FOR SHARE;
 IF l.id IS NULL OR l.organization_id<>NEW.organization_id THEN RAISE EXCEPTION 'Authorized lease required' USING ERRCODE='23514';END IF;
 IF maintenance_manager(l.organization_id) THEN
 IF NOT management_inviter_lock(l.organization_id) THEN RAISE EXCEPTION 'Actual current manager required' USING ERRCODE='42501';END IF;
 g:=management_unit_grant_lock(l.unit_id,l.organization_id);u:=management_lease_unit(l.unit_id,l.organization_id);
 ELSE
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Current manager workflow authority required' USING ERRCODE='42501';END IF;
 tenant_source:=tenant_maintenance_source(l.id);u:=jsonb_build_object('version',tenant_source->'unitVersion');
 IF tenant_source IS NULL OR NEW.user_id IS DISTINCT FROM actor_id() OR NEW.grant_version IS DISTINCT FROM (tenant_source->>'grantVersion')::int THEN RAISE EXCEPTION 'Active linked tenant required' USING ERRCODE='42501';END IF;
 END IF;
 IF NEW.lease_version IS DISTINCT FROM l.version OR NEW.unit_version IS DISTINCT FROM (u->>'version')::int OR (maintenance_manager(l.organization_id) AND (g IS NULL OR NEW.grant_version IS DISTINCT FROM g)) OR NEW.updated_by IS DISTINCT FROM actor_id() OR NEW.updated_at IS DISTINCT FROM statement_timestamp() OR NEW.user_id IS DISTINCT FROM (SELECT user_id FROM tenants WHERE id=l.tenant_id) OR NEW.category NOT IN ('Plumbing','Electrical','Heating','Appliance','Other') OR NEW.urgency NOT IN ('Routine','Urgent','Emergency') THEN RAISE EXCEPTION 'Current maintenance actor/source snapshots required' USING ERRCODE='23514';END IF;
 IF TG_OP='INSERT' THEN
 IF NEW.version<>1 OR NEW.opened_by IS DISTINCT FROM actor_id() OR NEW.status<>'open' OR NEW.assignee_id IS NOT NULL OR NEW.assignee IS NOT NULL OR NEW.public_note IS NOT NULL OR NEW.internal_note IS NOT NULL THEN RAISE EXCEPTION 'New open maintenance request required' USING ERRCODE='23514';END IF;
 ELSE
 IF NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['status','version','assignee_id','assignee','public_note','lease_version','unit_version','grant_version','updated_by','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','assignee_id','assignee','public_note','lease_version','unit_version','grant_version','updated_by','updated_at']) OR NOT ((OLD.status='open' AND NEW.status='triaged') OR (OLD.status='triaged' AND NEW.status='assigned') OR (OLD.status='assigned' AND NEW.status='in_progress') OR (OLD.status='in_progress' AND NEW.status='resolved') OR (OLD.status='resolved' AND NEW.status IN ('closed','reopened')) OR (OLD.status='reopened' AND NEW.status IN ('triaged','assigned'))) THEN RAISE EXCEPTION 'Versioned valid maintenance transition required' USING ERRCODE='23514';END IF;
 END IF;
 IF NEW.status IN ('assigned','in_progress') AND NEW.assignee_id IS NULL THEN RAISE EXCEPTION 'Actual assignee required' USING ERRCODE='23514';END IF;
 IF NEW.assignee_id IS NOT NULL THEN
 SELECT EXISTS(SELECT 1 FROM profiles p JOIN memberships m ON m.user_id=p.id WHERE p.id=NEW.assignee_id AND p.state='active' AND m.status='active' AND m.organization_id=l.organization_id AND m.role='property_manager') INTO assigned;
 IF NOT assigned THEN RAISE EXCEPTION 'Current same-team assignee required' USING ERRCODE='23514';END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER maintenance_request_guard BEFORE INSERT OR UPDATE OR DELETE ON maintenance FOR EACH ROW EXECUTE FUNCTION maintenance_request_guard();
CREATE FUNCTION maintenance_photo_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE r maintenance%ROWTYPE;a media_assets%ROWTYPE;
BEGIN
 IF current_user<>'haven_app' OR management_admin() THEN RETURN NEW;END IF;
 SELECT * INTO r FROM maintenance WHERE id=NEW.request_id FOR UPDATE;
 SELECT * INTO a FROM media_assets WHERE id=NEW.asset_id FOR SHARE;
 IF r.id IS NULL OR r.opened_by IS DISTINCT FROM actor_id() OR r.version<>1 OR EXISTS(SELECT 1 FROM maintenance_history WHERE request_id=r.id) OR NEW.actor_id IS DISTINCT FROM actor_id() OR a.owner_id IS DISTINCT FROM actor_id() OR a.version IS DISTINCT FROM NEW.asset_version OR a.status<>'approved' OR a.scan_at IS NULL OR a.visibility<>'private' OR a.purpose<>'photo' OR a.mime NOT IN ('image/jpeg','image/png') OR a.variants->>'display' IS NULL OR (SELECT count(*) FROM maintenance_photos WHERE request_id=r.id)>=6 THEN RAISE EXCEPTION 'Current owned scanned private photo at request creation required' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER maintenance_photo_guard BEFORE INSERT ON maintenance_photos FOR EACH ROW EXECUTE FUNCTION maintenance_photo_guard();
CREATE FUNCTION maintenance_activity_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE r maintenance%ROWTYPE;
BEGIN
 IF current_user<>'haven_app' OR management_admin() THEN RETURN NEW;END IF;
 SELECT * INTO r FROM maintenance WHERE id=NEW.request_id FOR SHARE;
 IF NEW.actor_id IS DISTINCT FROM actor_id() OR NEW.actor_id IS DISTINCT FROM r.updated_by OR NEW.version<>r.version OR NEW.status<>r.status OR NEW.public_note IS DISTINCT FROM r.public_note OR NEW.assignee_id IS DISTINCT FROM r.assignee_id OR NEW.at IS DISTINCT FROM r.updated_at THEN RAISE EXCEPTION 'Exact current maintenance activity required' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER maintenance_activity_guard BEFORE INSERT ON maintenance_history FOR EACH ROW EXECUTE FUNCTION maintenance_activity_guard();
CREATE FUNCTION maintenance_activity_required() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF current_user='haven_app' AND NOT management_admin() AND NOT EXISTS(SELECT 1 FROM maintenance_history h WHERE h.request_id=NEW.id AND h.version=NEW.version) THEN RAISE EXCEPTION 'Maintenance activity must commit atomically' USING ERRCODE='23514';END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER maintenance_activity_required AFTER INSERT OR UPDATE ON maintenance DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION maintenance_activity_required();
CREATE FUNCTION maintenance_private_photo(target uuid,asset uuid) RETURNS TABLE(id uuid,version int,display_key text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT maintenance_scope(target) THEN RETURN;END IF;
 RETURN QUERY SELECT a.id,a.version,a.variants->>'display' FROM maintenance_photos p JOIN media_assets a ON a.id=p.asset_id AND a.version=p.asset_version WHERE p.request_id=target AND p.asset_id=asset AND a.status='approved' AND a.scan_at IS NOT NULL AND a.visibility='private' AND a.purpose='photo' FOR SHARE OF p,a;
END $$;
REVOKE ALL ON FUNCTION maintenance_manager(uuid),maintenance_scope(uuid),tenant_maintenance_source(uuid),maintenance_private_photo(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION maintenance_manager(uuid),maintenance_scope(uuid),tenant_maintenance_source(uuid),maintenance_private_photo(uuid,uuid) TO haven_app;
CREATE INDEX maintenance_queue_scope ON maintenance(organization_id,status,created_at DESC,id);
CREATE INDEX maintenance_tenant_queue ON maintenance(user_id,created_at DESC,id);
