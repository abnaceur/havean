-- Current managers update the full workflow; original linked active tenants comment or reopen resolved cases.
CREATE OR REPLACE FUNCTION maintenance_request_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE l leases%ROWTYPE;u jsonb;g int;tenant_source jsonb;assigned boolean;
BEGIN
 IF current_user<>'haven_app' OR management_admin() THEN IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Maintenance history is retained' USING ERRCODE='42501';END IF;
 SELECT * INTO l FROM leases WHERE id=NEW.lease_id;
 IF l.id IS NULL OR l.organization_id<>NEW.organization_id THEN RAISE EXCEPTION 'Authorized lease required' USING ERRCODE='23514';END IF;
 IF maintenance_manager(l.organization_id) THEN
 SELECT * INTO l FROM leases WHERE id=NEW.lease_id FOR SHARE;
 IF NOT management_inviter_lock(l.organization_id) THEN RAISE EXCEPTION 'Actual current manager required' USING ERRCODE='42501';END IF;
 g:=management_unit_grant_lock(l.unit_id,l.organization_id);u:=management_lease_unit(l.unit_id,l.organization_id);
 ELSE
 IF TG_OP='UPDATE' AND (OLD.user_id IS DISTINCT FROM actor_id() OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id OR NEW.assignee IS DISTINCT FROM OLD.assignee OR NOT ((NEW.status=OLD.status AND OLD.status<>'closed' AND NEW.public_note IS DISTINCT FROM OLD.public_note AND length(btrim(NEW.public_note)) BETWEEN 1 AND 2000) OR (OLD.status='resolved' AND NEW.status='reopened' AND length(btrim(NEW.public_note)) BETWEEN 10 AND 2000))) THEN RAISE EXCEPTION 'Own public comment or resolved-case reopen required' USING ERRCODE='42501';END IF;
 tenant_source:=tenant_maintenance_source(l.id);u:=jsonb_build_object('version',tenant_source->'unitVersion');
 IF tenant_source IS NULL OR NEW.user_id IS DISTINCT FROM actor_id() OR NEW.grant_version IS DISTINCT FROM (tenant_source->>'grantVersion')::int THEN RAISE EXCEPTION 'Active linked tenant required' USING ERRCODE='42501';END IF;
 END IF;
 IF NEW.lease_version IS DISTINCT FROM l.version OR NEW.unit_version IS DISTINCT FROM (u->>'version')::int OR (maintenance_manager(l.organization_id) AND (g IS NULL OR NEW.grant_version IS DISTINCT FROM g)) OR NEW.updated_by IS DISTINCT FROM actor_id() OR NEW.updated_at IS DISTINCT FROM statement_timestamp() OR NEW.user_id IS DISTINCT FROM (SELECT user_id FROM tenants WHERE id=l.tenant_id) OR NEW.category NOT IN ('Plumbing','Electrical','Heating','Appliance','Other') OR NEW.urgency NOT IN ('Routine','Urgent','Emergency') THEN RAISE EXCEPTION 'Current maintenance actor/source snapshots required' USING ERRCODE='23514';END IF;
 IF TG_OP='INSERT' THEN
 IF length(btrim(NEW.title)) NOT BETWEEN 5 AND 120 OR length(btrim(NEW.description)) NOT BETWEEN 10 AND 3000 OR NEW.created_at IS DISTINCT FROM statement_timestamp() OR NEW.version<>1 OR NEW.opened_by IS DISTINCT FROM actor_id() OR NEW.status<>'open' OR NEW.assignee_id IS NOT NULL OR NEW.assignee IS NOT NULL OR NEW.public_note IS NOT NULL OR NEW.internal_note IS NOT NULL THEN RAISE EXCEPTION 'New open maintenance request required' USING ERRCODE='23514';END IF;
 ELSE
 IF NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['status','version','assignee_id','assignee','public_note','lease_version','unit_version','grant_version','updated_by','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','assignee_id','assignee','public_note','lease_version','unit_version','grant_version','updated_by','updated_at']) OR NOT ((OLD.status=NEW.status AND OLD.status<>'closed') OR (OLD.status='open' AND NEW.status='triaged') OR (OLD.status='triaged' AND NEW.status='assigned') OR (OLD.status='assigned' AND NEW.status='in_progress') OR (OLD.status='in_progress' AND NEW.status='resolved') OR (OLD.status='resolved' AND NEW.status IN ('closed','reopened')) OR (OLD.status='reopened' AND NEW.status IN ('triaged','assigned'))) THEN RAISE EXCEPTION 'Versioned valid maintenance transition required' USING ERRCODE='23514';END IF;
 END IF;
 IF NEW.status IN ('assigned','in_progress') AND NEW.assignee_id IS NULL THEN RAISE EXCEPTION 'Actual assignee required' USING ERRCODE='23514';END IF;
 IF NEW.assignee_id IS NOT NULL THEN
 SELECT EXISTS(SELECT 1 FROM profiles p JOIN memberships m ON m.user_id=p.id WHERE p.id=NEW.assignee_id AND p.state='active' AND m.status='active' AND m.organization_id=l.organization_id AND m.role='property_manager') INTO assigned;
 IF NOT assigned THEN RAISE EXCEPTION 'Current same-team assignee required' USING ERRCODE='23514';END IF;
 END IF;
 RETURN NEW;
END $$;
