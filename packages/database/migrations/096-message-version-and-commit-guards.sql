CREATE OR REPLACE FUNCTION message_participant_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE thread conversations%ROWTYPE;next_sequence bigint;
BEGIN
 IF staff_scope() THEN RETURN NEW;END IF;
 IF NEW.sender_id<>actor_id() THEN RAISE EXCEPTION 'Actual message sender required' USING ERRCODE='42501';END IF;
 SELECT * INTO thread FROM conversations c WHERE c.id=NEW.conversation_id AND conversation_scope(c.id) FOR UPDATE;
 IF NOT FOUND OR thread.state<>'active' THEN RAISE EXCEPTION 'Active conversation participant required' USING ERRCODE='42501';END IF;
 IF NEW.version<>1 OR NEW.context_version IS DISTINCT FROM thread.version OR NEW.request_hash IS NULL OR NEW.request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Current context version and durable message receipt required' USING ERRCODE='23514';END IF;
 SELECT coalesce(max(sequence),0)+1 INTO next_sequence FROM messages WHERE conversation_id=NEW.conversation_id;
 IF NEW.sequence<>next_sequence THEN RAISE EXCEPTION 'Ordered message sequence required' USING ERRCODE='23514';END IF;RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION message_attachment_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF staff_scope() THEN RETURN NEW;END IF;
 IF NOT EXISTS(SELECT 1 FROM messages m JOIN conversations c ON c.id=m.conversation_id JOIN conversation_uploads cu ON cu.conversation_id=c.id AND cu.asset_id=NEW.asset_id AND cu.creator_id=m.sender_id JOIN media_assets a ON a.id=cu.asset_id AND a.owner_id=m.sender_id WHERE m.id=NEW.message_id AND m.sender_id=actor_id() AND m.created_at=transaction_timestamp() AND m.context_version=c.version AND c.state='active' AND conversation_scope(c.id) AND a.status='approved' AND a.scan_at IS NOT NULL AND a.visibility='private' AND a.version=NEW.asset_version) THEN RAISE EXCEPTION 'New committed message and owned scanned conversation attachment required' USING ERRCODE='42501';END IF;RETURN NEW;
END $$;
