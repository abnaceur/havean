CREATE TABLE message_send_windows(user_id uuid NOT NULL REFERENCES profiles,window_start timestamptz NOT NULL,attempts int NOT NULL CHECK(attempts BETWEEN 1 AND 61),PRIMARY KEY(user_id,window_start));
ALTER TABLE message_send_windows ENABLE ROW LEVEL SECURITY;
CREATE POLICY message_send_window_read ON message_send_windows FOR SELECT USING(staff_scope() OR user_id=actor_id());
CREATE POLICY message_send_window_staff ON message_send_windows FOR ALL USING(staff_scope()) WITH CHECK(staff_scope());
GRANT SELECT,INSERT,UPDATE,DELETE ON message_send_windows TO haven_app;
CREATE FUNCTION admit_message_send(target uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE n int;stamp timestamptz=date_trunc('minute',clock_timestamp());
BEGIN
 IF NOT conversation_scope(target) THEN RAISE EXCEPTION 'Conversation participant required' USING ERRCODE='42501';END IF;
 DELETE FROM message_send_windows WHERE user_id=actor_id() AND window_start<stamp-interval '2 days';
 INSERT INTO message_send_windows(user_id,window_start,attempts) VALUES(actor_id(),stamp,1) ON CONFLICT(user_id,window_start) DO UPDATE SET attempts=least(message_send_windows.attempts+1,61) RETURNING attempts INTO n;
 RETURN n<=60;
END $$;
REVOKE ALL ON FUNCTION admit_message_send(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admit_message_send(uuid) TO haven_app;
