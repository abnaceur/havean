CREATE TABLE lead_activity(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lead_id uuid NOT NULL REFERENCES leads ON DELETE CASCADE,kind text NOT NULL CHECK(kind IN('created','stage','assignment','note')),actor_id uuid,version int NOT NULL CHECK(version>0),previous_status text,status text NOT NULL,agent_id uuid,text text CHECK(text IS NULL OR length(trim(text)) BETWEEN 2 AND 2000),created_at timestamptz NOT NULL DEFAULT statement_timestamp(),CHECK((kind='note')=(text IS NOT NULL)));
CREATE INDEX lead_activity_order ON lead_activity(lead_id,created_at,id);
CREATE INDEX lead_crm_order ON leads(organization_id,created_at DESC,id);
CREATE FUNCTION professional_lead_scope(p_lead uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM leads l JOIN organizations o ON o.id=l.organization_id JOIN memberships m ON m.organization_id=o.id AND m.user_id=actor_id() AND m.status='active' JOIN profiles p ON p.id=m.user_id AND p.state='active' WHERE l.id=p_lead AND l.organization_id=org_id() AND (m.role='admin' OR o.type='agency' AND (m.role='agency_manager' OR m.role='agent' AND EXISTS(SELECT 1 FROM agents a WHERE a.id=l.agent_id AND a.user_id=actor_id() AND a.organization_id=org_id())) OR o.type='developer' AND m.role='developer' OR o.type='vendor' AND m.role='vendor'))
$$;
REVOKE ALL ON FUNCTION professional_lead_scope(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION professional_lead_scope(uuid) TO haven_app;
ALTER TABLE lead_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY lead_activity_read ON lead_activity FOR SELECT USING(professional_lead_scope(lead_id) OR staff_scope());
CREATE POLICY lead_activity_note ON lead_activity FOR INSERT WITH CHECK(kind='note' AND actor_id=actor_id() AND professional_lead_scope(lead_id) AND EXISTS(SELECT 1 FROM leads l WHERE l.id=lead_id AND l.version=lead_activity.version AND l.status=lead_activity.status AND l.status NOT IN('won','lost','closed','converted')));
-- No UPDATE/DELETE policies: application roles cannot edit/remove history.
-- Cascaded deletion follows an authorized lead privacy/deletion operation.
CREATE TRIGGER lead_activity_immutable BEFORE UPDATE ON lead_activity FOR EACH ROW EXECUTE FUNCTION immutable_posted();
CREATE FUNCTION lead_crm_activity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='INSERT' THEN INSERT INTO lead_activity(lead_id,kind,actor_id,version,status,agent_id) VALUES(NEW.id,'created',actor_id(),NEW.version,NEW.status,NEW.agent_id);
 ELSE
  IF NEW.status IS DISTINCT FROM OLD.status THEN INSERT INTO lead_activity(lead_id,kind,actor_id,version,previous_status,status,agent_id) VALUES(NEW.id,'stage',actor_id(),NEW.version,OLD.status,NEW.status,NEW.agent_id);END IF;
  IF NEW.agent_id IS DISTINCT FROM OLD.agent_id THEN INSERT INTO lead_activity(lead_id,kind,actor_id,version,status,agent_id) VALUES(NEW.id,'assignment',actor_id(),NEW.version,NEW.status,NEW.agent_id);END IF;
 END IF;RETURN NULL;
END $$;
CREATE TRIGGER lead_crm_activity AFTER INSERT OR UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION lead_crm_activity();
CREATE FUNCTION lead_crm_stage_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status IS NOT DISTINCT FROM OLD.status OR staff_scope() THEN RETURN NEW;END IF;
 IF NEW.version<>OLD.version+1 OR NOT professional_lead_scope(OLD.id) OR NOT (CASE OLD.status WHEN 'new' THEN NEW.status IN('assigned','contacted','lost') WHEN 'assigned' THEN NEW.status IN('contacted','lost') WHEN 'contacted' THEN NEW.status IN('qualified','lost') WHEN 'qualified' THEN NEW.status IN('viewing','offer','lost') WHEN 'viewing' THEN NEW.status IN('offer','lost') WHEN 'offer' THEN NEW.status IN('won','lost') ELSE false END) THEN RAISE EXCEPTION 'Authorized current CRM transition required' USING ERRCODE='23514';END IF;RETURN NEW;
END $$;
CREATE TRIGGER lead_crm_stage_guard BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION lead_crm_stage_guard();
