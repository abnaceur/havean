CREATE FUNCTION support_staff_lock(target uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM 1 FROM profiles WHERE id=target AND state='active' FOR SHARE;
 IF NOT FOUND THEN RETURN false;END IF;
 PERFORM 1 FROM memberships WHERE user_id=target AND organization_id IS NULL AND status='active' AND role IN('support','admin') ORDER BY id FOR SHARE;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION support_staff_lock(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION support_staff_lock(uuid) TO haven_app;
