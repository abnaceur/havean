-- Additive correction: INSERT RETURNING permits the actor's pending thread before lead linkage.
ALTER POLICY linked_conversation_read ON conversations USING(staff_scope() OR conversation_scope(id) OR state='legacy' AND user_id=actor_id());

CREATE OR REPLACE FUNCTION conversation_fact_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_user<>'haven_app' OR staff_scope() THEN RETURN NEW;END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.user_id<>actor_id() OR NEW.version<>1 OR NEW.state<>'legacy' OR NEW.lead_id IS NOT NULL OR NEW.resource_type IS NOT NULL OR NEW.resource_version IS NOT NULL THEN RAISE EXCEPTION 'Own pending conversation required' USING ERRCODE='42501';END IF;
 ELSE
  IF NOT conversation_scope(OLD.id) OR NEW.version<>OLD.version+1 OR (NEW.user_id,NEW.organization_id,NEW.agent_id,NEW.resource_id,NEW.lead_id,NEW.resource_type,NEW.resource_version,NEW.state) IS DISTINCT FROM (OLD.user_id,OLD.organization_id,OLD.agent_id,OLD.resource_id,OLD.lead_id,OLD.resource_type,OLD.resource_version,OLD.state) THEN RAISE EXCEPTION 'Conversation grants and context are source-owned' USING ERRCODE='42501';END IF;
 END IF;RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS conversation_fact_guard ON conversations;
CREATE TRIGGER conversation_fact_guard BEFORE INSERT OR UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION conversation_fact_guard();
CREATE OR REPLACE FUNCTION message_participant_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF staff_scope() THEN RETURN NEW;END IF;
 IF NEW.sender_id<>actor_id() OR NOT conversation_scope(NEW.conversation_id) OR NOT EXISTS(SELECT 1 FROM conversations c WHERE c.id=NEW.conversation_id AND c.state='active') THEN RAISE EXCEPTION 'Active conversation participant required' USING ERRCODE='42501';END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION message_participant_guard() FROM PUBLIC;
DROP TRIGGER IF EXISTS message_participant_guard ON messages;
CREATE TRIGGER message_participant_guard BEFORE INSERT OR UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION message_participant_guard();

REVOKE ALL ON FUNCTION conversation_fact_guard() FROM PUBLIC;
