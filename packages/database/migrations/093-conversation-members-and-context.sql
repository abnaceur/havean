ALTER TABLE conversations ADD COLUMN version int NOT NULL DEFAULT 1,ADD COLUMN state text NOT NULL DEFAULT 'legacy' CHECK(state IN('active','legacy','closed')),ADD COLUMN lead_id uuid UNIQUE REFERENCES leads(id) ON DELETE SET NULL,ADD COLUMN resource_type text CHECK(resource_type IN('listing','development','agent','provider')),ADD COLUMN resource_version int;
CREATE TABLE conversation_members(
 conversation_id uuid NOT NULL REFERENCES conversations ON DELETE CASCADE,user_id uuid NOT NULL REFERENCES profiles,
 kind text NOT NULL CHECK(kind IN('customer','agent','team')),status text NOT NULL DEFAULT 'active' CHECK(status IN('active','revoked')),
 version int NOT NULL DEFAULT 1,provenance text NOT NULL CHECK(provenance IN('recorded_lead','historical_thread')),created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(conversation_id,user_id)
);
CREATE FUNCTION conversation_scope(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM conversations c JOIN conversation_members cm ON cm.conversation_id=c.id AND cm.user_id=actor_id() AND cm.status='active' JOIN profiles p ON p.id=cm.user_id AND p.state='active' LEFT JOIN leads l ON l.id=c.lead_id AND l.conversation_id=c.id WHERE c.id=target AND (
 cm.kind='customer' AND c.user_id=actor_id() OR
 cm.kind='agent' AND c.organization_id=org_id() AND EXISTS(SELECT 1 FROM agents a JOIN memberships m ON m.user_id=a.user_id AND m.organization_id=a.organization_id AND m.status='active' AND m.role='agent' WHERE a.id=coalesce(l.agent_id,c.agent_id) AND a.user_id=actor_id() AND a.organization_id=c.organization_id) OR
 cm.kind='team' AND c.lead_id IS NOT NULL AND l.id IS NOT NULL AND c.organization_id=org_id() AND EXISTS(SELECT 1 FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=actor_id() AND m.organization_id=c.organization_id AND m.status='active' AND (m.role='admin' OR o.type='agency' AND m.role='agency_manager' OR o.type='developer' AND m.role='developer' OR o.type='vendor' AND m.role='vendor'))))
$$;
REVOKE ALL ON FUNCTION conversation_scope(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION conversation_scope(uuid) TO haven_app;
ALTER TABLE conversation_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY member_read ON conversation_members FOR SELECT USING(staff_scope() OR conversation_scope(conversation_id));
CREATE POLICY member_service ON conversation_members FOR ALL USING(staff_scope()) WITH CHECK(staff_scope());
GRANT SELECT,INSERT,UPDATE,DELETE ON conversation_members TO haven_app;
CREATE POLICY linked_conversation_read ON conversations AS RESTRICTIVE FOR SELECT USING(staff_scope() OR conversation_scope(id));
-- Keep the original organization/customer insert authority; guessed member inserts are denied.
CREATE FUNCTION refresh_conversation_members(target uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE source leads%ROWTYPE;thread conversations%ROWTYPE;
BEGIN
 SELECT * INTO source FROM leads WHERE id=target;IF NOT FOUND OR source.conversation_id IS NULL THEN RETURN;END IF;
 SELECT * INTO thread FROM conversations WHERE id=source.conversation_id FOR UPDATE;
 IF NOT FOUND OR (thread.user_id,thread.organization_id,thread.resource_id) IS DISTINCT FROM (source.user_id,source.organization_id,source.resource_id) THEN RAISE EXCEPTION 'Exact conversation resource link required' USING ERRCODE='23514';END IF;
 UPDATE conversations SET lead_id=source.id,agent_id=source.agent_id,resource_type=source.resource_type,resource_version=source.resource_version,state='active',version=version+1 WHERE id=thread.id;
 UPDATE conversation_members SET status='revoked',version=version+1 WHERE conversation_id=thread.id AND status='active';
 INSERT INTO conversation_members(conversation_id,user_id,kind,provenance) VALUES(thread.id,source.user_id,'customer','recorded_lead') ON CONFLICT(conversation_id,user_id) DO UPDATE SET status='active',kind='customer',provenance='recorded_lead',version=conversation_members.version+1;
 INSERT INTO conversation_members(conversation_id,user_id,kind,provenance) SELECT thread.id,a.user_id,'agent','recorded_lead' FROM agents a JOIN profiles p ON p.id=a.user_id AND p.state='active' WHERE a.id=source.agent_id AND a.organization_id=source.organization_id AND EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=a.user_id AND m.organization_id=a.organization_id AND m.status='active' AND m.role='agent') ON CONFLICT(conversation_id,user_id) DO UPDATE SET status='active',kind=CASE WHEN conversation_members.kind='customer' THEN 'customer' ELSE 'agent' END,provenance='recorded_lead',version=conversation_members.version+1;
 INSERT INTO conversation_members(conversation_id,user_id,kind,provenance) SELECT thread.id,m.user_id,'team','recorded_lead' FROM memberships m JOIN profiles p ON p.id=m.user_id AND p.state='active' JOIN organizations o ON o.id=m.organization_id WHERE m.organization_id=source.organization_id AND m.status='active' AND (m.role='admin' OR o.type='agency' AND m.role='agency_manager' OR o.type='developer' AND m.role='developer' OR o.type='vendor' AND m.role='vendor') ON CONFLICT(conversation_id,user_id) DO UPDATE SET status='active',kind=CASE WHEN conversation_members.kind IN('customer','agent') THEN conversation_members.kind ELSE 'team' END,provenance='recorded_lead',version=conversation_members.version+1;
END $$;
REVOKE ALL ON FUNCTION refresh_conversation_members(uuid) FROM PUBLIC;
INSERT INTO conversation_members(conversation_id,user_id,kind,provenance) SELECT id,user_id,'customer','historical_thread' FROM conversations;
INSERT INTO conversation_members(conversation_id,user_id,kind,provenance) SELECT c.id,a.user_id,'agent','historical_thread' FROM conversations c JOIN agents a ON a.id=c.agent_id AND a.organization_id=c.organization_id ON CONFLICT DO NOTHING;
SELECT refresh_conversation_members(id) FROM leads WHERE conversation_id IS NOT NULL;
CREATE FUNCTION sync_conversation_members() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.conversation_id,NEW.agent_id,NEW.user_id,NEW.organization_id,NEW.resource_id) IS NOT DISTINCT FROM (OLD.conversation_id,OLD.agent_id,OLD.user_id,OLD.organization_id,OLD.resource_id) THEN RETURN NEW;END IF;
 PERFORM refresh_conversation_members(NEW.id);RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION sync_conversation_members() FROM PUBLIC;
CREATE TRIGGER sync_conversation_members AFTER INSERT OR UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION sync_conversation_members();
