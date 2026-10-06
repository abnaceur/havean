-- SELECT FOR SHARE also requires UPDATE authority. Keep guest sessions read-only,
-- and expose only the current session's public metadata through this narrow port.
CREATE FUNCTION lock_current_inquiry_session(p_id uuid) RETURNS TABLE(id uuid,version int,expires_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_id IS DISTINCT FROM inquiry_guest_actor() THEN RAISE EXCEPTION 'Own inquiry session required' USING ERRCODE='42501';END IF;
 RETURN QUERY SELECT s.id,s.version,s.expires_at FROM inquiry_sessions s WHERE s.id=p_id AND s.status='active' AND s.expires_at>statement_timestamp() FOR SHARE;
END $$;
REVOKE ALL ON FUNCTION lock_current_inquiry_session(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lock_current_inquiry_session(uuid) TO haven_app;
