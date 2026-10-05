-- The isolated seed runs as the schema owner, not a PostgreSQL superuser.
-- Public application connections cannot claim the historical fixture state.
CREATE OR REPLACE FUNCTION development_review_actor_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.state='approved' AND (TG_OP='INSERT' OR OLD.state<>'approved') THEN
  IF NOT (review_scope() OR staff_scope()) OR NEW.reviewed_by IS DISTINCT FROM actor_id() OR NEW.submitted_by=actor_id() OR EXISTS(SELECT 1 FROM developments WHERE id=NEW.development_id AND organization_id=org_id()) THEN RAISE EXCEPTION 'Independent project review is required' USING ERRCODE='42501'; END IF;
 END IF;
 IF NEW.state='legacy_published' AND (TG_OP='INSERT' OR OLD.state<>'legacy_published') AND NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='development_publication'::regclass AND pg_has_role(session_user,relowner,'USAGE')) THEN RAISE EXCEPTION 'Legacy fixture import is restricted to database bootstrap' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
