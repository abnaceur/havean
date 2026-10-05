-- Expose only the versioned retry transition; clients cannot alter frozen delivery data.
CREATE FUNCTION retry_own_alert(target uuid, expected integer) RETURNS SETOF alert_digests
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF actor_id() IS NULL THEN RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('optional-alerts:'||actor_id()::text,0));
 RETURN QUERY UPDATE alert_digests SET status='queued',attempts=0,due_at=now(),
 version=version+1,error_code=NULL,updated_at=now()
 WHERE id=target AND user_id=actor_id() AND version=expected AND status='failed'
 RETURNING *;
END;
$$;
REVOKE ALL ON FUNCTION retry_own_alert(uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retry_own_alert(uuid,integer) TO haven_app;
