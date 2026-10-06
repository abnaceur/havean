ALTER TABLE tenants ADD COLUMN version int NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE leases ADD COLUMN drafted_by uuid REFERENCES profiles,ADD COLUMN management_grant_id uuid REFERENCES management_grants,ADD COLUMN grant_version int,ADD COLUMN unit_version int,ADD COLUMN tenant_version int,ADD COLUMN rent_period text NOT NULL DEFAULT 'month' CHECK(rent_period='month'),ADD COLUMN due_day int CHECK(due_day BETWEEN 1 AND 28);
ALTER TABLE leases ADD CONSTRAINT native_lease_source CHECK(drafted_by IS NULL OR (management_grant_id IS NOT NULL AND grant_version>0 AND unit_version>0 AND tenant_version>0 AND due_day IS NOT NULL));
CREATE TABLE lease_documents(lease_id uuid NOT NULL REFERENCES leases,asset_id uuid NOT NULL REFERENCES media_assets,asset_version int NOT NULL CHECK(asset_version>0),label text NOT NULL CHECK(length(label) BETWEEN 2 AND 100),PRIMARY KEY(lease_id,asset_id));
CREATE TABLE lease_draft_history(lease_id uuid NOT NULL REFERENCES leases,version int NOT NULL,action text NOT NULL,snapshot jsonb NOT NULL,actor_id uuid NOT NULL REFERENCES profiles,at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(lease_id,version));
ALTER TABLE lease_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE lease_draft_history ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION management_tenant_unit_authorized(target_tenant uuid,target_unit uuid,target_org uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT management_unit_granted(target_unit,target_org) AND EXISTS(SELECT 1 FROM tenants t WHERE t.id=target_tenant AND t.organization_id=target_org AND (EXISTS(SELECT 1 FROM tenant_invitations i WHERE i.tenant_id=t.id AND i.unit_id=target_unit AND i.organization_id=target_org AND i.status='accepted' AND management_grant_valid(i.grant_id)) OR EXISTS(SELECT 1 FROM leases l WHERE l.tenant_id=t.id AND l.unit_id=target_unit AND l.organization_id=target_org))) $$;
CREATE FUNCTION management_lease_unit(target uuid,target_org uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE snapshot jsonb;
BEGIN
 IF NOT management_unit_granted(target,target_org) THEN RETURN NULL;END IF;
 SELECT jsonb_build_object('id',u.id,'version',u.version,'currency',ci.currency,'community',co.name) INTO snapshot FROM units u JOIN communities co ON co.id=u.community_id JOIN districts d ON d.id=co.district_id JOIN cities ci ON ci.id=d.city_id WHERE u.id=target FOR SHARE OF u;
 RETURN snapshot;
END $$;
CREATE FUNCTION lease_document_asset_grant(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM lease_documents d JOIN leases l ON l.id=d.lease_id WHERE d.asset_id=target AND (management_admin() OR management_unit_granted(l.unit_id,l.organization_id))) $$;
CREATE POLICY lease_document_private_read ON media_assets FOR SELECT USING(visibility='private' AND lease_document_asset_grant(id));
CREATE POLICY lease_document_team ON lease_documents USING(EXISTS(SELECT 1 FROM leases l WHERE l.id=lease_id AND (management_admin() OR management_unit_granted(l.unit_id,l.organization_id)))) WITH CHECK(EXISTS(SELECT 1 FROM leases l WHERE l.id=lease_id AND l.status='draft' AND management_unit_granted(l.unit_id,l.organization_id)));
CREATE POLICY lease_draft_history_read ON lease_draft_history FOR SELECT USING(EXISTS(SELECT 1 FROM leases l WHERE l.id=lease_id));
CREATE POLICY lease_draft_history_append ON lease_draft_history FOR INSERT WITH CHECK(actor_id=actor_id() AND EXISTS(SELECT 1 FROM leases l WHERE l.id=lease_id AND l.version=lease_draft_history.version AND management_unit_granted(l.unit_id,l.organization_id)));
CREATE FUNCTION native_lease_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE unit jsonb;g management_grants%ROWTYPE;t tenants%ROWTYPE;
BEGIN
 IF current_user<>'haven_app' OR management_admin() THEN IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Lease history is retained' USING ERRCODE='42501';END IF;
 IF NOT management_inviter_lock(NEW.organization_id) OR management_unit_grant_lock(NEW.unit_id,NEW.organization_id) IS NULL THEN RAISE EXCEPTION 'Current manager/property authority required' USING ERRCODE='42501';END IF;
 IF TG_OP='INSERT' AND (NEW.drafted_by IS DISTINCT FROM actor_id() OR NEW.version<>1 OR NEW.status<>'draft') THEN RAISE EXCEPTION 'Native lease draft source required' USING ERRCODE='23514';END IF;
 IF TG_OP='UPDATE' THEN
 IF NEW.version<>OLD.version+1 OR NEW.organization_id<>OLD.organization_id OR NEW.unit_id<>OLD.unit_id OR NEW.tenant_id<>OLD.tenant_id OR NEW.drafted_by IS DISTINCT FROM OLD.drafted_by THEN RAISE EXCEPTION 'Versioned immutable lease identity required' USING ERRCODE='42501';END IF;
 IF OLD.status<>'draft' AND (to_jsonb(NEW)-ARRAY['status','version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version']) THEN RAISE EXCEPTION 'Activated lease terms are immutable' USING ERRCODE='42501';END IF;
 END IF;
 IF NEW.drafted_by IS NOT NULL AND NEW.status='draft' THEN
 unit:=management_lease_unit(NEW.unit_id,NEW.organization_id);
 SELECT * INTO g FROM management_grants WHERE id=NEW.management_grant_id AND unit_id=NEW.unit_id AND organization_id=NEW.organization_id AND management_grant_valid(id);
 SELECT * INTO t FROM tenants WHERE id=NEW.tenant_id AND organization_id=NEW.organization_id FOR SHARE;
 IF unit IS NULL OR g.id IS NULL OR g.version<>NEW.grant_version OR (unit->>'version')::int<>NEW.unit_version OR unit->>'currency'<>NEW.currency OR t.id IS NULL OR t.version<>NEW.tenant_version OR NOT management_tenant_unit_authorized(t.id,NEW.unit_id,NEW.organization_id) THEN RAISE EXCEPTION 'Current unit/currency/grant/tenant link versions required' USING ERRCODE='23514';END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER native_lease_guard BEFORE INSERT OR UPDATE OR DELETE ON leases FOR EACH ROW EXECUTE FUNCTION native_lease_guard();
CREATE FUNCTION lease_document_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE l leases%ROWTYPE;m media_assets%ROWTYPE;
BEGIN
 IF current_user<>'haven_app' OR management_admin() THEN IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;END IF;
 SELECT * INTO l FROM leases WHERE id=coalesce(NEW.lease_id,OLD.lease_id) FOR SHARE;
 IF l.id IS NULL OR l.status<>'draft' OR NOT management_inviter_lock(l.organization_id) OR management_unit_grant_lock(l.unit_id,l.organization_id) IS NULL THEN RAISE EXCEPTION 'Current managed draft required' USING ERRCODE='42501';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;
 SELECT * INTO m FROM media_assets WHERE id=NEW.asset_id FOR SHARE;
 IF m.id IS NULL OR m.owner_id<>actor_id() OR m.version<>NEW.asset_version OR m.status<>'approved' OR m.scan_at IS NULL OR m.visibility<>'private' OR m.purpose<>'document' OR m.mime<>'application/pdf' THEN RAISE EXCEPTION 'Approved owned private PDF and current version required' USING ERRCODE='42501';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER lease_document_guard BEFORE INSERT OR UPDATE OR DELETE ON lease_documents FOR EACH ROW EXECUTE FUNCTION lease_document_guard();
CREATE FUNCTION lease_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF current_user='haven_app' AND TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Lease history is immutable' USING ERRCODE='42501';END IF;IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;END $$;
CREATE TRIGGER lease_history_guard BEFORE UPDATE OR DELETE ON lease_draft_history FOR EACH ROW EXECUTE FUNCTION lease_history_guard();
REVOKE ALL ON FUNCTION management_tenant_unit_authorized(uuid,uuid,uuid),management_lease_unit(uuid,uuid),lease_document_asset_grant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION management_tenant_unit_authorized(uuid,uuid,uuid),management_lease_unit(uuid,uuid),lease_document_asset_grant(uuid) TO haven_app;
