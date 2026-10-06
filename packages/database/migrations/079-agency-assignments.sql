ALTER TABLE leads ADD COLUMN conversation_id uuid REFERENCES conversations(id);
-- Only unambiguous historical links are inferred. New inquiries store their exact thread.
UPDATE leads l SET conversation_id=(SELECT c.id FROM conversations c WHERE c.user_id=l.user_id AND c.organization_id=l.organization_id AND c.resource_id=l.resource_id ORDER BY c.created_at,c.id LIMIT 1)
WHERE (SELECT count(*) FROM conversations c WHERE c.user_id=l.user_id AND c.organization_id=l.organization_id AND c.resource_id=l.resource_id)=1;
CREATE TABLE listing_assignment_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),listing_id uuid NOT NULL REFERENCES listings,organization_id uuid NOT NULL REFERENCES organizations,actor_id uuid NOT NULL,previous_agent_id uuid REFERENCES agents,agent_id uuid NOT NULL REFERENCES agents,version int NOT NULL,policy text NOT NULL CHECK(policy IN('preserve_leads','move_open_leads')),reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 5 AND 1000),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(listing_id,version));
CREATE TABLE lead_assignment_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lead_id uuid NOT NULL REFERENCES leads,organization_id uuid NOT NULL REFERENCES organizations,actor_id uuid NOT NULL,previous_agent_id uuid REFERENCES agents,agent_id uuid NOT NULL REFERENCES agents,version int NOT NULL,reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 5 AND 1000),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(lead_id,version));
ALTER TABLE listing_assignment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_assignment_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY listing_assignment_history_read ON listing_assignment_history FOR SELECT USING(staff_scope() OR (organization_id=org_id() AND EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=actor_id() AND m.organization_id=org_id() AND m.role='agency_manager' AND m.status='active')));
CREATE POLICY lead_assignment_history_read ON lead_assignment_history FOR SELECT USING(staff_scope() OR (organization_id=org_id() AND EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=actor_id() AND m.organization_id=org_id() AND m.role='agency_manager' AND m.status='active')));
CREATE POLICY listing_assignment_history_insert ON listing_assignment_history FOR INSERT WITH CHECK(actor_id=actor_id() AND organization_id=org_id() AND EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=actor_id() AND m.organization_id=org_id() AND m.role='agency_manager' AND m.status='active'));
CREATE POLICY lead_assignment_history_insert ON lead_assignment_history FOR INSERT WITH CHECK(actor_id=actor_id() AND organization_id=org_id() AND EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=actor_id() AND m.organization_id=org_id() AND m.role='agency_manager' AND m.status='active'));
-- A narrow notification port cannot address arbitrary users or arbitrary resources.
CREATE FUNCTION notify_agency_assignment(resource_type text,resource uuid,source_event uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE recipient uuid;kind text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=actor_id() AND m.organization_id=org_id() AND m.role='agency_manager' AND m.status='active' AND o.type='agency') THEN RAISE EXCEPTION 'Agency manager required' USING ERRCODE='42501';END IF;
 IF resource_type='listing' THEN SELECT a.user_id INTO recipient FROM listings l JOIN agents a ON a.id=l.agent_id AND a.organization_id=l.organization_id WHERE l.id=resource AND l.organization_id=org_id();kind='listing.agent_assigned';
 ELSIF resource_type='lead' THEN SELECT a.user_id INTO recipient FROM leads l JOIN agents a ON a.id=l.agent_id AND a.organization_id=l.organization_id WHERE l.id=resource AND l.organization_id=org_id();kind='lead.agent_assigned';
 ELSE RAISE EXCEPTION 'Unknown assignment resource' USING ERRCODE='23514';END IF;
 IF recipient IS NULL OR NOT EXISTS(SELECT 1 FROM outbox e WHERE e.id=source_event AND e.aggregate_id=resource AND e.kind=kind) THEN RAISE EXCEPTION 'Current assignment event required' USING ERRCODE='23514';END IF;
 INSERT INTO notifications(user_id,title,body,source_event_id) VALUES(recipient,'New agency assignment','Your agency manager assigned a '+resource_type+'. Open your professional workspace to review your current assignments.',source_event) ON CONFLICT(source_event_id) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION notify_agency_assignment(text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION notify_agency_assignment(text,uuid,uuid) TO haven_app;
