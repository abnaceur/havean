CREATE TABLE tenant_invitations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations,grant_id uuid NOT NULL REFERENCES management_grants,grant_version int NOT NULL CHECK(grant_version>0),unit_id uuid NOT NULL REFERENCES units,email text NOT NULL CHECK(email=lower(email)),name text NOT NULL CHECK(length(name) BETWEEN 2 AND 100),status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','accepted','declined','cancelled')),version int NOT NULL DEFAULT 1 CHECK(version>0),created_by uuid NOT NULL REFERENCES profiles,accepted_by uuid REFERENCES profiles,tenant_id uuid REFERENCES tenants,reason text NOT NULL DEFAULT '',expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',created_at timestamptz NOT NULL DEFAULT now(),CHECK((status='accepted')=(accepted_by IS NOT NULL AND tenant_id IS NOT NULL)));
CREATE UNIQUE INDEX tenant_pending_invitation ON tenant_invitations(organization_id,unit_id,email) WHERE status='pending';
CREATE TABLE tenant_invitation_activity(invitation_id uuid NOT NULL REFERENCES tenant_invitations,version int NOT NULL,action text NOT NULL,actor_id uuid NOT NULL REFERENCES profiles,at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(invitation_id,version));
ALTER TABLE tenant_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_invitation_activity ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION management_inviter_lock(target uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF target IS DISTINCT FROM org_id() THEN RETURN false;END IF;
 PERFORM 1 FROM profiles p JOIN memberships m ON m.user_id=p.id JOIN organizations o ON o.id=m.organization_id WHERE p.id=actor_id() AND p.state='active' AND m.status='active' AND m.role='property_manager' AND m.organization_id=target AND o.type='manager' ORDER BY m.id LIMIT 1 FOR SHARE OF p,m,o;
 RETURN FOUND;
END $$;
CREATE FUNCTION tenant_invitation_team(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM tenant_invitations i WHERE i.id=target AND management_team(i.organization_id) AND management_grant_valid(i.grant_id)) $$;
CREATE FUNCTION tenant_invitation_recipient(target_email text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM profiles p WHERE p.id=actor_id() AND p.state='active' AND p.email_verified AND lower(p.email)=target_email) $$;
CREATE POLICY tenant_invitation_read ON tenant_invitations FOR SELECT USING(management_admin() OR tenant_invitation_recipient(email) OR management_team(organization_id) AND management_grant_valid(grant_id));
CREATE POLICY tenant_invitation_create ON tenant_invitations FOR INSERT WITH CHECK(created_by=actor_id() AND organization_id=org_id() AND management_team(organization_id) AND management_grant_valid(grant_id));
CREATE POLICY tenant_invitation_cancel ON tenant_invitations FOR UPDATE USING(organization_id=org_id() AND management_team(organization_id) AND management_grant_valid(grant_id)) WITH CHECK(organization_id=org_id() AND management_team(organization_id) AND management_grant_valid(grant_id));
CREATE FUNCTION tenant_invitation_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE g management_grants%ROWTYPE;
BEGIN
 IF current_user<>'haven_app' THEN IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Tenant invitation history is retained' USING ERRCODE='42501';END IF;
 IF NOT management_inviter_lock(NEW.organization_id) THEN RAISE EXCEPTION 'Current property manager authority is required' USING ERRCODE='42501';END IF;
 IF TG_OP='INSERT' THEN
 SELECT * INTO g FROM management_grants WHERE id=NEW.grant_id AND unit_id=NEW.unit_id AND organization_id=NEW.organization_id;
 IF g.id IS NULL OR g.version<>NEW.grant_version OR management_unit_grant_lock(NEW.unit_id,NEW.organization_id) IS NULL OR NEW.created_by<>actor_id() OR NEW.version<>1 OR NEW.status<>'pending' OR NEW.accepted_by IS NOT NULL OR NEW.tenant_id IS NOT NULL OR NEW.expires_at<=statement_timestamp() OR NEW.expires_at>now()+interval '7 days' OR NEW.created_at<>now() THEN RAISE EXCEPTION 'Current granted unit and invitation state required' USING ERRCODE='23514';END IF;
 ELSE
 IF OLD.status<>'pending' OR NEW.status<>'cancelled' OR NEW.version<>OLD.version+1 OR length(NEW.reason) NOT BETWEEN 5 AND 500 OR (to_jsonb(NEW)-ARRAY['status','version','reason']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','reason']) THEN RAISE EXCEPTION 'Only versioned pending cancellation allowed' USING ERRCODE='42501';END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tenant_invitation_guard BEFORE INSERT OR UPDATE OR DELETE ON tenant_invitations FOR EACH ROW EXECUTE FUNCTION tenant_invitation_guard();
CREATE FUNCTION tenant_invitation_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 INSERT INTO tenant_invitation_activity(invitation_id,version,action,actor_id) VALUES(NEW.id,NEW.version,CASE WHEN TG_OP='INSERT' THEN 'invited' ELSE NEW.status END,actor_id());
 INSERT INTO audit_events(actor_id,resource_id,action) VALUES(actor_id(),NEW.id,'tenant.invitation_'||CASE WHEN TG_OP='INSERT' THEN 'invited' ELSE NEW.status END);
 INSERT INTO outbox(aggregate_id,kind,payload) VALUES(NEW.id,'tenant.invitation_'||CASE WHEN TG_OP='INSERT' THEN 'invited' ELSE NEW.status END,jsonb_build_object('version',NEW.version));
 RETURN NEW;
END $$;
CREATE TRIGGER tenant_invitation_audit AFTER INSERT OR UPDATE ON tenant_invitations FOR EACH ROW EXECUTE FUNCTION tenant_invitation_audit();
CREATE POLICY tenant_invitation_activity_read ON tenant_invitation_activity FOR SELECT USING(EXISTS(SELECT 1 FROM tenant_invitations i WHERE i.id=invitation_id));
CREATE FUNCTION tenant_invitation_activity_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF current_user='haven_app' THEN RAISE EXCEPTION 'Invitation history is immutable' USING ERRCODE='42501';END IF;IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;END $$;
CREATE TRIGGER tenant_invitation_activity_guard BEFORE INSERT OR UPDATE OR DELETE ON tenant_invitation_activity FOR EACH ROW EXECUTE FUNCTION tenant_invitation_activity_guard();
CREATE FUNCTION decide_tenant_invitation(target uuid,expected int,decision text,decision_reason text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p profiles%ROWTYPE;i tenant_invitations%ROWTYPE;g management_grants%ROWTYPE;linked uuid;
BEGIN
 SELECT * INTO p FROM profiles WHERE id=actor_id() AND state='active' AND email_verified FOR UPDATE;
 SELECT * INTO i FROM tenant_invitations WHERE id=target AND email=lower(p.email) FOR UPDATE;
 IF i.id IS NULL THEN RAISE EXCEPTION 'Invitation unavailable to verified recipient' USING ERRCODE='42501';END IF;
 IF i.status<>'pending' OR i.version<>expected OR i.expires_at<=statement_timestamp() OR decision NOT IN('accept','decline') OR length(decision_reason) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'Invitation changed or expired' USING ERRCODE='23514';END IF;
 SELECT * INTO g FROM management_grants WHERE id=i.grant_id AND unit_id=i.unit_id AND organization_id=i.organization_id AND management_grant_valid(id) FOR SHARE;
 IF g.id IS NULL OR g.version<>i.grant_version THEN RAISE EXCEPTION 'Management authority changed' USING ERRCODE='23514';END IF;
 PERFORM 1 FROM memberships m JOIN profiles creator ON creator.id=m.user_id WHERE m.user_id=i.created_by AND creator.state='active' AND m.organization_id=i.organization_id AND m.role='property_manager' AND m.status='active' FOR SHARE OF m,creator;
 IF NOT FOUND THEN RAISE EXCEPTION 'Inviting manager authority ended' USING ERRCODE='42501';END IF;
 IF g.owner_authority_id IS NOT NULL THEN PERFORM 1 FROM owner_unit_grants a WHERE a.id=g.owner_authority_id AND a.version=g.owner_authority_version AND a.status='active' AND (a.expires_at IS NULL OR a.expires_at>statement_timestamp()) FOR SHARE;IF NOT FOUND THEN RAISE EXCEPTION 'Owner authority ended' USING ERRCODE='42501';END IF;END IF;
 IF decision='accept' THEN
 PERFORM pg_advisory_xact_lock(hashtextextended('tenant-account:'||i.organization_id::text||':'||p.id::text,0));
 SELECT id INTO linked FROM tenants WHERE organization_id=i.organization_id AND user_id=p.id ORDER BY id LIMIT 1 FOR UPDATE;
 IF linked IS NULL THEN INSERT INTO tenants(organization_id,user_id,name,email) VALUES(i.organization_id,p.id,i.name,lower(p.email)) RETURNING id INTO linked;END IF;
 UPDATE tenant_invitations SET status='accepted',accepted_by=p.id,tenant_id=linked,version=version+1,reason=decision_reason WHERE id=i.id;
 ELSE UPDATE tenant_invitations SET status='declined',version=version+1,reason=decision_reason WHERE id=i.id;END IF;
 RETURN linked;
END $$;
CREATE FUNCTION managed_tenant_visible(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM tenants t WHERE t.id=target AND management_team(t.organization_id) AND (EXISTS(SELECT 1 FROM leases l WHERE l.tenant_id=t.id AND management_unit_granted(l.unit_id,l.organization_id)) OR EXISTS(SELECT 1 FROM tenant_invitations i WHERE i.tenant_id=t.id AND i.status='accepted' AND management_grant_valid(i.grant_id)))) $$;
CREATE POLICY tenant_current_manager_scope ON tenants AS RESTRICTIVE USING(org_id() IS NULL OR management_admin() OR managed_tenant_visible(id));
CREATE FUNCTION tenant_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF current_user='haven_app' AND NOT management_admin() THEN RAISE EXCEPTION 'Tenant accounts require verified invitation acceptance' USING ERRCODE='42501';END IF;IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;END $$;
CREATE TRIGGER tenant_identity_guard BEFORE INSERT OR UPDATE OR DELETE ON tenants FOR EACH ROW EXECUTE FUNCTION tenant_identity_guard();
REVOKE ALL ON FUNCTION management_inviter_lock(uuid),tenant_invitation_team(uuid),tenant_invitation_recipient(text),decide_tenant_invitation(uuid,int,text,text),managed_tenant_visible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION management_inviter_lock(uuid),tenant_invitation_team(uuid),tenant_invitation_recipient(text),decide_tenant_invitation(uuid,int,text,text),managed_tenant_visible(uuid) TO haven_app;
