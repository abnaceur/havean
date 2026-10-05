CREATE FUNCTION agent_only() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('app.agent_only',true),'false')='true' $$;
CREATE POLICY agent_listing_assignment ON listings AS RESTRICTIVE FOR UPDATE USING(NOT agent_only() OR agent_id IN(SELECT id FROM agents WHERE user_id=actor_id()));
CREATE POLICY agent_lead_assignment ON leads AS RESTRICTIVE FOR SELECT USING(NOT agent_only() OR user_id=actor_id() OR agent_id IN(SELECT id FROM agents WHERE user_id=actor_id()));
CREATE POLICY agent_lead_mutation ON leads AS RESTRICTIVE FOR UPDATE USING(NOT agent_only() OR agent_id IN(SELECT id FROM agents WHERE user_id=actor_id()));
CREATE POLICY agent_conversation_assignment ON conversations AS RESTRICTIVE FOR SELECT USING(NOT agent_only() OR user_id=actor_id() OR agent_id IN(SELECT id FROM agents WHERE user_id=actor_id()));
CREATE POLICY agent_viewing_assignment ON viewings AS RESTRICTIVE FOR SELECT USING(NOT agent_only() OR user_id=actor_id() OR agent_id IN(SELECT id FROM agents WHERE user_id=actor_id()));
CREATE POLICY agent_viewing_mutation ON viewings AS RESTRICTIVE FOR UPDATE USING(NOT agent_only() OR user_id=actor_id() OR agent_id IN(SELECT id FROM agents WHERE user_id=actor_id()));
ALTER TABLE listing_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY revision_scope ON listing_revisions USING(actor_id=actor_id() OR staff_scope() OR review_scope()) WITH CHECK(actor_id=actor_id() OR staff_scope());
