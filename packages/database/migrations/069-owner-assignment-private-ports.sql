-- Assignment authority does not grant access to private owner contact/evidence data.
DROP POLICY agency_submission_scope ON owner_submissions;
CREATE FUNCTION owner_assignment_queue() RETURNS TABLE(id uuid,version integer,status text,organization_id uuid,assigned_agent_id uuid,title text,agent_name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT s.id,s.version,s.status,s.organization_id,s.assigned_agent_id,s.data->>'title',ag.name FROM owner_submissions s LEFT JOIN agents ag ON ag.id=s.assigned_agent_id WHERE s.status='submitted' AND (staff_scope() OR review_scope() OR (s.organization_id=org_id() AND EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=actor_id() AND m.organization_id=org_id() AND m.role='agency_manager' AND m.status='active'))) ORDER BY s.created_at,s.id LIMIT 100
$$;
REVOKE ALL ON FUNCTION owner_assignment_queue() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION owner_assignment_queue() TO haven_app;
CREATE FUNCTION assign_owner_submission(request_id uuid,expected_version integer,next_agent uuid) RETURNS TABLE(code integer,version integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE source owner_submissions%ROWTYPE; candidate agents%ROWTYPE; broad boolean;
BEGIN
 broad=staff_scope() OR review_scope();
 IF NOT broad AND NOT EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=actor_id() AND m.organization_id=org_id() AND m.role='agency_manager' AND m.status='active') THEN RETURN QUERY SELECT 403,0;RETURN;END IF;
 SELECT * INTO source FROM owner_submissions s WHERE s.id=request_id AND (broad OR s.organization_id=org_id()) FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 404,0;RETURN;END IF;
 IF source.user_id=actor_id() THEN RETURN QUERY SELECT 403,0;RETURN;END IF;
 IF source.status<>'submitted' OR source.version<>expected_version THEN RETURN QUERY SELECT 409,0;RETURN;END IF;
 SELECT ag.* INTO candidate FROM agents ag JOIN profiles p ON p.id=ag.user_id WHERE ag.id=next_agent AND (broad OR ag.organization_id=org_id()) AND ag.verified_until>=current_date AND p.state='active' AND EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=ag.user_id AND m.organization_id=ag.organization_id AND m.role='agent' AND m.status='active') FOR SHARE OF ag;
 IF NOT FOUND THEN RETURN QUERY SELECT 404,0;RETURN;END IF;
 UPDATE owner_submissions SET assigned_agent_id=candidate.id,organization_id=candidate.organization_id,version=source.version+1 WHERE owner_submissions.id=request_id;
 RETURN QUERY SELECT 200,source.version+1;
END $$;
REVOKE ALL ON FUNCTION assign_owner_submission(uuid,integer,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION assign_owner_submission(uuid,integer,uuid) TO haven_app;
