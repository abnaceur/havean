-- Called only with the JWT-verified current actor in the identity callback transaction.
CREATE FUNCTION bootstrap_own_consumer() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM 1 FROM profiles p WHERE p.id=actor_id() AND p.state='active' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Verified active identity context required' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=actor_id()) THEN INSERT INTO memberships(user_id,role,change_reason) VALUES(actor_id(),'consumer','Initial consumer role after verified identity-provider callback');END IF;
END $$;
REVOKE ALL ON FUNCTION bootstrap_own_consumer() FROM PUBLIC;GRANT EXECUTE ON FUNCTION bootstrap_own_consumer() TO haven_app;
