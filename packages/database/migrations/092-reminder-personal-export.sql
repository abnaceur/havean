CREATE FUNCTION own_viewing_reminders() RETURNS TABLE(id uuid,viewing_id uuid,booking_version int,status text,version int,due_at timestamptz,accepted_at timestamptz,attempts int,error_code text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT r.id,r.viewing_id,r.booking_version,r.status,r.version,r.due_at,r.accepted_at,r.attempts,r.error_code FROM viewing_reminders r WHERE r.user_id=actor_id() AND EXISTS(SELECT 1 FROM profiles p WHERE p.id=actor_id() AND p.state='active') ORDER BY r.id
$$;
REVOKE ALL ON FUNCTION own_viewing_reminders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION own_viewing_reminders() TO haven_app;
