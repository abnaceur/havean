ALTER TABLE support_cases ADD COLUMN last_action text;
ALTER TABLE support_case_history ADD COLUMN action text NOT NULL DEFAULT 'status_recorded';
CREATE FUNCTION support_admin_actor(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM profiles p JOIN memberships m ON m.user_id=p.id WHERE p.id=target AND p.state='active' AND m.organization_id IS NULL AND m.status='active' AND m.role='admin') $$;
CREATE FUNCTION support_case_private_access(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT support_staff_actor(actor_id()) AND EXISTS(SELECT 1 FROM support_cases s WHERE s.id=target AND (s.assignee_id=actor_id() OR support_admin_actor(actor_id()))) $$;
CREATE TABLE support_case_internal_notes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),case_id uuid NOT NULL REFERENCES support_cases,case_version int NOT NULL CHECK(case_version>0),body text NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 2000),actor_id uuid NOT NULL REFERENCES profiles,at timestamptz NOT NULL DEFAULT statement_timestamp());
ALTER TABLE support_case_internal_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY support_notes_read ON support_case_internal_notes FOR SELECT USING(support_case_private_access(case_id));
CREATE POLICY support_notes_append ON support_case_internal_notes FOR INSERT WITH CHECK(actor_id=actor_id() AND support_case_private_access(case_id));
CREATE TRIGGER support_notes_immutable BEFORE UPDATE OR DELETE ON support_case_internal_notes FOR EACH ROW EXECUTE FUNCTION lease_history_guard();
CREATE OR REPLACE FUNCTION support_case_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE staff boolean;private_access boolean;
BEGIN
 IF current_user<>'haven_app' THEN RETURN NEW;END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Support case history must be retained' USING ERRCODE='23514';END IF;
 PERFORM 1 FROM profiles WHERE id=actor_id() AND state='active' FOR SHARE;
 IF NOT FOUND OR NEW.updated_by IS DISTINCT FROM actor_id() OR NEW.updated_at IS DISTINCT FROM statement_timestamp() THEN RAISE EXCEPTION 'Current support actor required' USING ERRCODE='23514';END IF;
 IF length(btrim(NEW.subject)) NOT BETWEEN 5 AND 120 OR length(btrim(NEW.description)) NOT BETWEEN 10 AND 3000 OR NEW.category NOT IN('General','Listing complaint','Account','Viewing','Other') OR (NEW.category='Listing complaint' AND NEW.listing_id IS NULL) OR ((NEW.listing_id IS NULL)<>(NEW.listing_snapshot IS NULL)) OR (NEW.listing_id IS NOT NULL AND (NEW.listing_version IS NULL OR NEW.listing_version<1 OR NEW.listing_snapshot->>'id' IS DISTINCT FROM NEW.listing_id::text OR (NEW.listing_snapshot->>'version')::int IS DISTINCT FROM NEW.listing_version)) THEN RAISE EXCEPTION 'Validated support case context required' USING ERRCODE='23514';END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.listing_id IS NOT NULL AND NOT support_listing_admitted(NEW.listing_id,NEW.listing_version,NEW.listing_snapshot) THEN RAISE EXCEPTION 'Current public listing snapshot required' USING ERRCODE='23514';END IF;
  IF NEW.user_id IS DISTINCT FROM actor_id() OR NEW.created_by IS DISTINCT FROM actor_id() OR NEW.version<>1 OR NEW.status<>'open' OR NEW.public_reply IS NOT NULL OR NEW.internal_note IS NOT NULL OR NEW.assignee_id IS NOT NULL OR NEW.created_at IS DISTINCT FROM statement_timestamp() OR NEW.last_action IS NOT NULL THEN RAISE EXCEPTION 'New own open support case required' USING ERRCODE='23514';END IF;
 ELSE
  IF NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['version','status','public_reply','assignee_id','updated_by','updated_at','last_action']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['version','status','public_reply','assignee_id','updated_by','updated_at','last_action']) THEN RAISE EXCEPTION 'Versioned original support facts required' USING ERRCODE='23514';END IF;
  staff:=support_staff_lock(actor_id());private_access:=staff AND (coalesce(OLD.assignee_id=actor_id(),false) OR support_admin_actor(actor_id()));
  IF NEW.last_action='triage' THEN
   IF NOT staff OR OLD.status<>'open' OR NEW.status<>'triaged' OR NEW.assignee_id IS NULL OR NOT support_staff_lock(NEW.assignee_id) OR length(btrim(NEW.public_reply)) NOT BETWEEN 5 AND 2000 THEN RAISE EXCEPTION 'Current support triage required' USING ERRCODE='23514';END IF;
  ELSIF NEW.last_action='reopen' THEN
   IF OLD.user_id IS DISTINCT FROM actor_id() OR OLD.status<>'resolved' OR NEW.status<>'open' OR NEW.assignee_id IS NOT NULL OR length(btrim(NEW.public_reply)) NOT BETWEEN 10 AND 2000 THEN RAISE EXCEPTION 'Own resolved case and reopening reason required' USING ERRCODE='23514';END IF;
  ELSIF NEW.last_action='comment' THEN
   IF NOT (OLD.user_id=actor_id() OR private_access) OR OLD.status NOT IN('open','triaged','escalated') OR NEW.status IS DISTINCT FROM OLD.status OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id OR length(btrim(NEW.public_reply)) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Current public case comment required' USING ERRCODE='23514';END IF;
  ELSE
   IF NOT private_access OR OLD.status NOT IN('triaged','escalated') THEN RAISE EXCEPTION 'Assigned support workflow required' USING ERRCODE='23514';END IF;
   IF NEW.last_action='note' THEN
    IF NEW.status IS DISTINCT FROM OLD.status OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id OR NEW.public_reply IS DISTINCT FROM OLD.public_reply THEN RAISE EXCEPTION 'Private note preserves public facts' USING ERRCODE='23514';END IF;
   ELSIF NEW.last_action='assign' THEN
    IF NEW.status IS DISTINCT FROM OLD.status OR NEW.assignee_id IS NULL OR NOT support_staff_lock(NEW.assignee_id) OR length(btrim(NEW.public_reply)) NOT BETWEEN 5 AND 2000 THEN RAISE EXCEPTION 'Current support handoff required' USING ERRCODE='23514';END IF;
   ELSIF NEW.last_action IN('escalate','deescalate','resolve') THEN
    IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id OR length(btrim(NEW.public_reply)) NOT BETWEEN 10 AND 2000 OR NOT ((NEW.last_action='escalate' AND OLD.status='triaged' AND NEW.status='escalated') OR (NEW.last_action='deescalate' AND OLD.status='escalated' AND NEW.status='triaged') OR (NEW.last_action='resolve' AND NEW.status='resolved')) THEN RAISE EXCEPTION 'Valid support progression and public reason required' USING ERRCODE='23514';END IF;
   ELSE RAISE EXCEPTION 'Unsupported support workflow action' USING ERRCODE='23514';END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION support_history_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE s support_cases%ROWTYPE;message text;action text;
BEGIN
 SELECT * INTO s FROM support_cases WHERE id=NEW.case_id FOR SHARE;action:=coalesce(s.last_action,'opened');message:=CASE WHEN s.last_action='note' THEN NULL ELSE s.public_reply END;
 IF s.id IS NULL OR NEW.version<>s.version OR NEW.actor_id IS DISTINCT FROM actor_id() OR NEW.actor_id IS DISTINCT FROM s.updated_by OR NEW.status IS DISTINCT FROM s.status OR NEW.public_message IS DISTINCT FROM message OR NEW.assignee_id IS DISTINCT FROM s.assignee_id OR NEW.at IS DISTINCT FROM s.updated_at OR NEW.action IS DISTINCT FROM action THEN RAISE EXCEPTION 'Exact support history required' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION support_private_note_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE s support_cases%ROWTYPE;root_transaction bigint;
BEGIN
 SELECT * INTO s FROM support_cases WHERE id=NEW.case_id FOR SHARE;SELECT xmin::text::bigint INTO root_transaction FROM support_cases WHERE id=NEW.case_id;
 IF s.id IS NULL OR s.last_action<>'note' OR s.status NOT IN('triaged','escalated') OR s.version<>NEW.case_version OR NEW.actor_id IS DISTINCT FROM actor_id() OR s.updated_by IS DISTINCT FROM actor_id() OR NOT support_case_private_access(s.id) OR root_transaction IS DISTINCT FROM (pg_current_xact_id()::text::numeric % 4294967296)::bigint OR NEW.at IS DISTINCT FROM s.updated_at THEN RAISE EXCEPTION 'Private note must accompany its admitted root update' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER support_private_note_guard BEFORE INSERT ON support_case_internal_notes FOR EACH ROW EXECUTE FUNCTION support_private_note_guard();
CREATE FUNCTION support_private_note_required() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$ BEGIN IF current_user='haven_app' AND NEW.last_action='note' AND NOT EXISTS(SELECT 1 FROM support_case_internal_notes n WHERE n.case_id=NEW.id AND n.case_version=NEW.version) THEN RAISE EXCEPTION 'Admitted private note must commit atomically' USING ERRCODE='23514';END IF;RETURN NULL;END $$;
CREATE CONSTRAINT TRIGGER support_private_note_required AFTER UPDATE ON support_cases DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION support_private_note_required();
REVOKE ALL ON FUNCTION support_admin_actor(uuid),support_case_private_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION support_admin_actor(uuid),support_case_private_access(uuid) TO haven_app;
