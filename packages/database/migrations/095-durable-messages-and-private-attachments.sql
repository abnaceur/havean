ALTER TABLE messages ADD COLUMN version int NOT NULL DEFAULT 1,ADD COLUMN request_hash text,ADD COLUMN context_version int;
ALTER TABLE media_assets ADD COLUMN version int NOT NULL DEFAULT 1;
CREATE TABLE conversation_uploads(asset_id uuid PRIMARY KEY REFERENCES media_assets,conversation_id uuid NOT NULL REFERENCES conversations ON DELETE CASCADE,creator_id uuid NOT NULL REFERENCES profiles,filename text NOT NULL CHECK(length(filename) BETWEEN 1 AND 120),mime text NOT NULL CHECK(mime IN('image/jpeg','image/png','application/pdf')),version int NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE message_attachments(message_id uuid NOT NULL REFERENCES messages ON DELETE CASCADE,asset_id uuid NOT NULL REFERENCES media_assets,asset_version int NOT NULL CHECK(asset_version>0),position int NOT NULL CHECK(position BETWEEN 0 AND 3),PRIMARY KEY(message_id,asset_id),UNIQUE(message_id,position));
ALTER TABLE conversation_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY chat_upload_read ON conversation_uploads FOR SELECT USING(staff_scope() OR creator_id=actor_id() OR conversation_scope(conversation_id));
CREATE POLICY chat_upload_insert ON conversation_uploads FOR INSERT WITH CHECK(staff_scope() OR creator_id=actor_id() AND conversation_scope(conversation_id));
CREATE POLICY chat_upload_retention ON conversation_uploads FOR DELETE USING(staff_scope());
CREATE POLICY message_attachment_read ON message_attachments FOR SELECT USING(staff_scope() OR EXISTS(SELECT 1 FROM messages m WHERE m.id=message_id AND conversation_scope(m.conversation_id)));
CREATE POLICY message_attachment_insert ON message_attachments FOR INSERT WITH CHECK(staff_scope() OR EXISTS(SELECT 1 FROM messages m WHERE m.id=message_id AND m.sender_id=actor_id() AND conversation_scope(m.conversation_id)));
CREATE POLICY message_attachment_retention ON message_attachments FOR DELETE USING(staff_scope());
GRANT SELECT,INSERT,DELETE ON conversation_uploads,message_attachments TO haven_app;
CREATE FUNCTION message_asset_scope(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM message_attachments ma JOIN messages m ON m.id=ma.message_id JOIN conversation_uploads cu ON cu.asset_id=ma.asset_id AND cu.conversation_id=m.conversation_id AND cu.creator_id=m.sender_id JOIN media_assets a ON a.id=ma.asset_id AND a.owner_id=m.sender_id WHERE ma.asset_id=target AND conversation_scope(m.conversation_id) AND a.visibility='private' AND a.status='approved' AND a.scan_at IS NOT NULL)
$$;
REVOKE ALL ON FUNCTION message_asset_scope(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION message_asset_scope(uuid) TO haven_app;
CREATE POLICY chat_media_read ON media_assets FOR SELECT USING(message_asset_scope(id));
CREATE FUNCTION message_immutable_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF staff_scope() THEN IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;
 RAISE EXCEPTION 'Committed messages are immutable; use the retention workflow' USING ERRCODE='42501';
END $$;
REVOKE ALL ON FUNCTION message_immutable_guard() FROM PUBLIC;
CREATE TRIGGER message_immutable_guard BEFORE UPDATE OR DELETE ON messages FOR EACH ROW EXECUTE FUNCTION message_immutable_guard();
CREATE FUNCTION message_attachment_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF staff_scope() THEN RETURN NEW;END IF;
 IF NOT EXISTS(SELECT 1 FROM messages m JOIN conversations c ON c.id=m.conversation_id JOIN conversation_uploads cu ON cu.conversation_id=c.id AND cu.asset_id=NEW.asset_id AND cu.creator_id=m.sender_id JOIN media_assets a ON a.id=cu.asset_id AND a.owner_id=m.sender_id WHERE m.id=NEW.message_id AND m.sender_id=actor_id() AND c.state='active' AND conversation_scope(c.id) AND a.status='approved' AND a.scan_at IS NOT NULL AND a.visibility='private' AND a.version=NEW.asset_version) THEN RAISE EXCEPTION 'Owned scanned conversation attachment required' USING ERRCODE='42501';END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION message_attachment_guard() FROM PUBLIC;
CREATE TRIGGER message_attachment_guard BEFORE INSERT ON message_attachments FOR EACH ROW EXECUTE FUNCTION message_attachment_guard();
