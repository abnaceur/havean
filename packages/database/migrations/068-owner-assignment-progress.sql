ALTER TABLE owner_submissions ADD COLUMN organization_id uuid REFERENCES organizations;
ALTER TABLE owner_submissions ADD COLUMN assigned_agent_id uuid REFERENCES agents;
UPDATE owner_submissions s SET organization_id=l.organization_id,assigned_agent_id=l.agent_id FROM listings l WHERE s.listing_id=l.id;
CREATE TABLE owner_submission_review_notes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),submission_id uuid NOT NULL REFERENCES owner_submissions ON DELETE CASCADE,reviewer_id uuid REFERENCES profiles,note text NOT NULL CHECK(length(note) BETWEEN 5 AND 500),created_at timestamptz NOT NULL DEFAULT now());
INSERT INTO owner_submission_review_notes(submission_id,note,created_at) SELECT id,data->>'reviewReason',created_at FROM owner_submissions WHERE length(data->>'reviewReason') BETWEEN 5 AND 500;
UPDATE owner_submissions SET data=data-'reviewReason' WHERE data ? 'reviewReason';
ALTER TABLE owner_submission_review_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY private_review_notes ON owner_submission_review_notes USING(staff_scope() OR review_scope()) WITH CHECK((staff_scope() OR review_scope()) AND reviewer_id=actor_id());
CREATE TABLE owner_submission_progress(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),submission_id uuid NOT NULL REFERENCES owner_submissions ON DELETE CASCADE,version integer NOT NULL,kind text NOT NULL CHECK(kind IN('submitted','assigned','approved','rejected')),agent_name text,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(submission_id,version));
ALTER TABLE owner_submission_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY safe_owner_progress ON owner_submission_progress FOR SELECT USING(EXISTS(SELECT 1 FROM owner_submissions s WHERE s.id=submission_id AND (s.user_id=actor_id() OR staff_scope() OR review_scope() OR s.organization_id=org_id())));
CREATE POLICY agency_submission_scope ON owner_submissions USING(organization_id=org_id() AND EXISTS(SELECT 1 FROM memberships WHERE user_id=actor_id() AND organization_id=org_id() AND role='agency_manager' AND status='active')) WITH CHECK(organization_id=org_id());
CREATE FUNCTION owner_submission_assignment_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='INSERT' AND NOT staff_scope() AND NOT review_scope() AND (NEW.organization_id IS NOT NULL OR NEW.assigned_agent_id IS NOT NULL OR NEW.status<>'draft') THEN RAISE EXCEPTION 'Only reviewers can initialize assignment or a decision' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND NOT staff_scope() AND NOT review_scope() THEN
  IF OLD.user_id=actor_id() THEN
   IF NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.assigned_agent_id IS DISTINCT FROM OLD.assigned_agent_id OR (NEW.status<>OLD.status AND NOT(OLD.status='draft' AND NEW.status='submitted')) THEN RAISE EXCEPTION 'Owner cannot assign or decide a request' USING ERRCODE='42501'; END IF;
  ELSIF OLD.organization_id=org_id() AND EXISTS(SELECT 1 FROM memberships WHERE user_id=actor_id() AND organization_id=org_id() AND role='agency_manager' AND status='active') THEN
   IF NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.status<>OLD.status OR OLD.status<>'submitted' OR NEW.data<>OLD.data OR NEW.user_id<>OLD.user_id OR NEW.listing_id IS DISTINCT FROM OLD.listing_id THEN RAISE EXCEPTION 'Agency may only assign its submitted requests' USING ERRCODE='42501'; END IF;
  ELSE RAISE EXCEPTION 'Unauthorized request mutation' USING ERRCODE='42501'; END IF;
 END IF;
 IF NEW.assigned_agent_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.assigned_agent_id IS DISTINCT FROM OLD.assigned_agent_id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id) AND NOT EXISTS(SELECT 1 FROM agents ag JOIN profiles p ON p.id=ag.user_id WHERE ag.id=NEW.assigned_agent_id AND ag.organization_id=NEW.organization_id AND ag.verified_until>=current_date AND p.state='active' AND EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=ag.user_id AND m.organization_id=ag.organization_id AND m.role='agent' AND m.status='active')) THEN RAISE EXCEPTION 'Assignment requires a current eligible agency agent' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER owner_submission_assignment_guard BEFORE INSERT OR UPDATE ON owner_submissions FOR EACH ROW EXECUTE FUNCTION owner_submission_assignment_guard();
ALTER TABLE notifications ADD COLUMN action_url text;
-- Engagement-owned write port, callable only by owner-run progress trigger.
CREATE FUNCTION notify_owner_submission_progress(progress_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 INSERT INTO notifications(user_id,title,body,source_event_id,action_url)
 SELECT s.user_id,'Property request update',CASE p.kind WHEN 'assigned' THEN 'Your request has been assigned to '||coalesce(p.agent_name,'an eligible agent')||'.' WHEN 'approved' THEN 'Your property request was approved.' WHEN 'rejected' THEN 'Your property review is complete. Contact support for the next step.' ELSE 'Your property request was submitted for review.' END,p.id,'/'||coalesce((SELECT ci.slug FROM communities co JOIN districts d ON d.id=co.district_id JOIN cities ci ON ci.id=d.city_id WHERE co.id::text=s.data->>'communityId'),'bj')||'/list-property?draft='||s.id
 FROM owner_submission_progress p JOIN owner_submissions s ON s.id=p.submission_id JOIN outbox o ON o.id=p.id AND o.kind='owner.progress_changed' WHERE p.id=progress_id ON CONFLICT(source_event_id) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION notify_owner_submission_progress(uuid) FROM PUBLIC,haven_app;
CREATE FUNCTION record_owner_submission_progress() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE progress_id uuid; next_kind text;
BEGIN
 IF NEW.status<>OLD.status AND NEW.status IN('submitted','approved','rejected') THEN next_kind=NEW.status;
 ELSIF NEW.assigned_agent_id IS DISTINCT FROM OLD.assigned_agent_id AND NEW.assigned_agent_id IS NOT NULL THEN next_kind='assigned'; ELSE RETURN NEW; END IF;
 INSERT INTO owner_submission_progress(submission_id,version,kind,agent_name) VALUES(NEW.id,NEW.version,next_kind,(SELECT name FROM agents WHERE id=NEW.assigned_agent_id)) RETURNING id INTO progress_id;
 INSERT INTO outbox(id,aggregate_id,kind,payload) VALUES(progress_id,NEW.id,'owner.progress_changed',jsonb_build_object('version',NEW.version,'kind',next_kind));
 PERFORM notify_owner_submission_progress(progress_id);RETURN NEW;
END $$;
CREATE TRIGGER record_owner_submission_progress AFTER UPDATE ON owner_submissions FOR EACH ROW EXECUTE FUNCTION record_owner_submission_progress();
