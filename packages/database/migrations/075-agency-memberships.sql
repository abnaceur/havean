ALTER TABLE memberships ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0),ADD COLUMN change_reason text NOT NULL DEFAULT '';
CREATE TABLE agency_invitations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations,email text NOT NULL CHECK(email=lower(email)),role text NOT NULL CHECK(role IN('agent','agency_manager')),status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','accepted','declined','cancelled','expired')),version integer NOT NULL DEFAULT 1 CHECK(version>0),created_by uuid NOT NULL REFERENCES profiles,accepted_by uuid REFERENCES profiles,reason text NOT NULL,expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX one_pending_agency_invite ON agency_invitations(organization_id,email,role) WHERE status='pending';
ALTER TABLE agency_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY agency_invitation_scope ON agency_invitations USING(staff_scope() OR (organization_id=org_id() AND EXISTS(SELECT 1 FROM memberships WHERE user_id=actor_id() AND organization_id=org_id() AND role='agency_manager' AND status='active')) OR EXISTS(SELECT 1 FROM profiles p WHERE p.id=actor_id() AND p.state='active' AND p.email_verified=true AND lower(p.email)=agency_invitations.email)) WITH CHECK(staff_scope() OR (organization_id=org_id() AND EXISTS(SELECT 1 FROM memberships WHERE user_id=actor_id() AND organization_id=org_id() AND role='agency_manager' AND status='active')));
-- Invoker security lets only this table's owner bypass through the validated narrow acceptance port.
CREATE FUNCTION agency_membership_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF pg_has_role(current_user,(SELECT relowner FROM pg_class WHERE oid='memberships'::regclass),'USAGE') OR staff_scope() THEN IF TG_OP='UPDATE' AND NEW.version=OLD.version THEN NEW.version=OLD.version+1;END IF;IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Membership removal must retain versioned history' USING ERRCODE='42501';END IF;
 IF NEW.organization_id IS DISTINCT FROM org_id() OR NOT EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=actor_id() AND m.organization_id=NEW.organization_id AND m.role='agency_manager' AND m.status='active') OR NEW.role NOT IN('agent','agency_manager') OR NEW.user_id=actor_id() THEN RAISE EXCEPTION 'Agency manager scope is required' USING ERRCODE='42501';END IF;
 IF TG_OP='UPDATE' AND (NEW.version<>OLD.version+1 OR NEW.user_id<>OLD.user_id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR OLD.role NOT IN('agent','agency_manager')) THEN RAISE EXCEPTION 'Versioned agency membership identity is required' USING ERRCODE='42501';END IF;
 IF NEW.status NOT IN('active','inactive') OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=NEW.user_id AND state='active') THEN RAISE EXCEPTION 'Active recipient and valid membership workflow are required' USING ERRCODE='23514';END IF;RETURN NEW;
END $$;
CREATE TRIGGER agency_membership_guard BEFORE INSERT OR UPDATE OR DELETE ON memberships FOR EACH ROW EXECUTE FUNCTION agency_membership_guard();
CREATE TABLE agency_membership_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),membership_id uuid NOT NULL,target_user_id uuid NOT NULL,organization_id uuid,actor_id uuid REFERENCES profiles,role text NOT NULL,status text NOT NULL,previous_role text,previous_status text,version integer NOT NULL,reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(membership_id,version));
ALTER TABLE agency_membership_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY agency_history_scope ON agency_membership_history FOR SELECT USING(staff_scope() OR target_user_id=actor_id() OR (organization_id=org_id() AND EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=actor_id() AND m.organization_id=org_id() AND m.role='agency_manager' AND m.status='active')));
CREATE FUNCTION agency_membership_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF actor_id() IS NOT NULL THEN INSERT INTO agency_membership_history(membership_id,target_user_id,organization_id,actor_id,role,status,previous_role,previous_status,version,reason) VALUES(NEW.id,NEW.user_id,NEW.organization_id,actor_id(),NEW.role,NEW.status,CASE WHEN TG_OP='UPDATE' THEN OLD.role ELSE NULL END,CASE WHEN TG_OP='UPDATE' THEN OLD.status ELSE NULL END,NEW.version,NEW.change_reason);INSERT INTO audit_events(actor_id,resource_id,action) VALUES(actor_id(),NEW.id,'agency.membership_changed');INSERT INTO outbox(aggregate_id,kind,payload) VALUES(NEW.id,'agency.membership_changed',jsonb_build_object('userId',NEW.user_id,'organizationId',NEW.organization_id,'role',NEW.role,'status',NEW.status,'version',NEW.version));END IF;RETURN NEW;
END $$;
CREATE TRIGGER agency_membership_audit AFTER INSERT OR UPDATE ON memberships FOR EACH ROW EXECUTE FUNCTION agency_membership_audit();
CREATE FUNCTION accept_agency_invitation(target uuid,expected integer,decision_reason text) RETURNS TABLE(id uuid,user_id uuid,role text,status text,version integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE invitation agency_invitations%ROWTYPE;person profiles%ROWTYPE;
BEGIN
 SELECT * INTO person FROM profiles p WHERE p.id=actor_id() AND p.state='active' AND p.email_verified=true FOR UPDATE;
 SELECT * INTO invitation FROM agency_invitations i WHERE i.id=target AND lower(person.email)=i.email FOR UPDATE;
 IF length(decision_reason) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'A decision reason is required' USING ERRCODE='23514';END IF;
 IF invitation.id IS NULL THEN RAISE EXCEPTION 'Invitation is unavailable to this verified recipient' USING ERRCODE='42501';END IF;
 IF invitation.status<>'pending' OR invitation.version<>expected OR invitation.expires_at<=now() OR NOT EXISTS(SELECT 1 FROM organizations o WHERE o.id=invitation.organization_id AND o.type='agency') THEN RAISE EXCEPTION 'Invitation changed or expired' USING ERRCODE='23514';END IF;
 IF EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=person.id AND m.organization_id=invitation.organization_id AND m.role=invitation.role AND m.status='active') THEN RAISE EXCEPTION 'Agency permission is already active' USING ERRCODE='23514';END IF;
 UPDATE agency_invitations SET status='accepted',accepted_by=person.id,reason=decision_reason,version=agency_invitations.version+1 WHERE agency_invitations.id=target;
 RETURN QUERY INSERT INTO memberships(user_id,organization_id,role,status,change_reason) VALUES(person.id,invitation.organization_id,invitation.role,'active',decision_reason) ON CONFLICT ON CONSTRAINT memberships_user_id_organization_id_role_key DO UPDATE SET status='active',version=memberships.version+1,change_reason=decision_reason RETURNING memberships.id,memberships.user_id,memberships.role,memberships.status,memberships.version;
END $$;
REVOKE ALL ON FUNCTION accept_agency_invitation(uuid,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION accept_agency_invitation(uuid,integer,text) TO haven_app;
CREATE FUNCTION decline_agency_invitation(target uuid,expected integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN UPDATE agency_invitations i SET status='declined',version=version+1 WHERE i.id=target AND i.version=expected AND i.status='pending' AND i.expires_at>now() AND EXISTS(SELECT 1 FROM profiles p WHERE p.id=actor_id() AND p.state='active' AND p.email_verified=true AND lower(p.email)=i.email);IF NOT FOUND THEN RAISE EXCEPTION 'Invitation is unavailable' USING ERRCODE='42501';END IF;END $$;
REVOKE ALL ON FUNCTION decline_agency_invitation(uuid,integer) FROM PUBLIC;GRANT EXECUTE ON FUNCTION decline_agency_invitation(uuid,integer) TO haven_app;

CREATE FUNCTION agency_invitation_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF pg_has_role(current_user,(SELECT relowner FROM pg_class WHERE oid='agency_invitations'::regclass),'USAGE') OR staff_scope() THEN IF TG_OP='UPDATE' AND NEW.version=OLD.version THEN NEW.version=OLD.version+1;END IF;IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Retain invitation history' USING ERRCODE='42501';END IF;
 IF NEW.organization_id IS DISTINCT FROM org_id() OR NOT EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=actor_id() AND m.organization_id=NEW.organization_id AND m.role='agency_manager' AND m.status='active') THEN RAISE EXCEPTION 'Agency manager scope required' USING ERRCODE='42501';END IF;
 IF TG_OP='INSERT' AND (NEW.created_by IS DISTINCT FROM actor_id() OR NEW.status<>'pending' OR NEW.accepted_by IS NOT NULL OR NEW.version<>1 OR NEW.expires_at<=now() OR NEW.expires_at>now()+interval '7 days') THEN RAISE EXCEPTION 'Invalid invitation creation' USING ERRCODE='23514';END IF;
 IF TG_OP='UPDATE' AND (NEW.version<>OLD.version+1 OR NEW.organization_id<>OLD.organization_id OR NEW.email<>OLD.email OR NEW.role<>OLD.role OR NEW.created_by<>OLD.created_by OR OLD.status<>'pending' OR NEW.status NOT IN('cancelled','expired') OR NEW.accepted_by IS NOT NULL OR NEW.status='expired' AND NEW.expires_at>now()) THEN RAISE EXCEPTION 'Invalid invitation transition' USING ERRCODE='42501';END IF;RETURN NEW;
END $$;
CREATE TRIGGER agency_invitation_guard BEFORE INSERT OR UPDATE OR DELETE ON agency_invitations FOR EACH ROW EXECUTE FUNCTION agency_invitation_guard();
