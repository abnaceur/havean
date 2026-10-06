CREATE OR REPLACE FUNCTION notify_agency_assignment(resource_type text,resource uuid,source_event uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE recipient uuid;assignment_kind text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=actor_id() AND m.organization_id=org_id() AND m.role='agency_manager' AND m.status='active' AND o.type='agency') THEN RAISE EXCEPTION 'Agency manager required' USING ERRCODE='42501';END IF;
 IF resource_type='listing' THEN SELECT a.user_id INTO recipient FROM listings l JOIN agents a ON a.id=l.agent_id AND a.organization_id=l.organization_id WHERE l.id=resource AND l.organization_id=org_id();assignment_kind='listing.agent_assigned';
 ELSIF resource_type='lead' THEN SELECT a.user_id INTO recipient FROM leads l JOIN agents a ON a.id=l.agent_id AND a.organization_id=l.organization_id WHERE l.id=resource AND l.organization_id=org_id();assignment_kind='lead.agent_assigned';
 ELSE RAISE EXCEPTION 'Unknown assignment resource' USING ERRCODE='23514';END IF;
 IF recipient IS NULL OR NOT EXISTS(SELECT 1 FROM outbox e WHERE e.id=source_event AND e.aggregate_id=resource AND e.kind=assignment_kind) THEN RAISE EXCEPTION 'Current assignment event required' USING ERRCODE='23514';END IF;
 INSERT INTO notifications(user_id,title,body,source_event_id) VALUES(recipient,'New agency assignment','Your agency manager assigned a '||resource_type||'. Open your professional workspace to review your current assignments.',source_event) ON CONFLICT(source_event_id) DO NOTHING;
END $$;

-- Shared historical threads are not guessed into private lead ownership.
UPDATE leads SET conversation_id=NULL WHERE conversation_id IN(SELECT conversation_id FROM leads WHERE conversation_id IS NOT NULL GROUP BY conversation_id HAVING count(*)>1);
CREATE UNIQUE INDEX lead_exact_conversation ON leads(conversation_id) WHERE conversation_id IS NOT NULL;
CREATE FUNCTION lead_conversation_scope_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.conversation_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM conversations c WHERE c.id=NEW.conversation_id AND c.user_id=NEW.user_id AND c.organization_id=NEW.organization_id AND c.resource_id=NEW.resource_id) THEN RAISE EXCEPTION 'Lead conversation must match its customer, agency and resource' USING ERRCODE='23514';END IF;RETURN NEW;
END $$;
CREATE TRIGGER lead_conversation_scope_guard BEFORE INSERT OR UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION lead_conversation_scope_guard();
