CREATE TABLE conversation_read_cursors(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),conversation_id uuid NOT NULL REFERENCES conversations ON DELETE CASCADE,user_id uuid NOT NULL REFERENCES profiles,sequence bigint NOT NULL CHECK(sequence>=0),version int NOT NULL DEFAULT 1 CHECK(version>0),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(conversation_id,user_id));
ALTER TABLE conversation_read_cursors ENABLE ROW LEVEL SECURITY;
CREATE POLICY chat_cursor_read ON conversation_read_cursors FOR SELECT USING(staff_scope() OR user_id=actor_id() AND conversation_scope(conversation_id));
CREATE POLICY chat_cursor_insert ON conversation_read_cursors FOR INSERT WITH CHECK(user_id=actor_id() AND conversation_scope(conversation_id));
CREATE POLICY chat_cursor_update ON conversation_read_cursors FOR UPDATE USING(user_id=actor_id() AND conversation_scope(conversation_id)) WITH CHECK(user_id=actor_id() AND conversation_scope(conversation_id));
CREATE POLICY chat_cursor_retention ON conversation_read_cursors FOR DELETE USING(staff_scope());
GRANT SELECT,INSERT,UPDATE,DELETE ON conversation_read_cursors TO haven_app;
CREATE FUNCTION conversation_cursor_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF staff_scope() THEN RETURN NEW;END IF;
 PERFORM 1 FROM conversations c WHERE c.id=NEW.conversation_id AND conversation_scope(c.id) FOR SHARE;
 IF NOT FOUND OR NEW.user_id<>actor_id() THEN RAISE EXCEPTION 'Current conversation participant required' USING ERRCODE='42501';END IF;
 IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.conversation_id<>OLD.conversation_id OR NEW.user_id<>OLD.user_id OR NEW.sequence<OLD.sequence OR NEW.version<>OLD.version+1) OR TG_OP='INSERT' AND NEW.version<>1 THEN RAISE EXCEPTION 'Invalid read cursor version or scope' USING ERRCODE='23514';END IF;
 IF NEW.sequence<>0 AND NOT EXISTS(SELECT 1 FROM messages m WHERE m.conversation_id=NEW.conversation_id AND m.sequence=NEW.sequence) THEN RAISE EXCEPTION 'Read cursor must reference a committed message' USING ERRCODE='23514';END IF;
 NEW.updated_at=now();RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION conversation_cursor_guard() FROM PUBLIC;
CREATE TRIGGER conversation_cursor_guard BEFORE INSERT OR UPDATE ON conversation_read_cursors FOR EACH ROW EXECUTE FUNCTION conversation_cursor_guard();
