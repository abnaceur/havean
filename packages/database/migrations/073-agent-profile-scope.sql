CREATE OR REPLACE FUNCTION agent_public_identity_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT staff_scope() AND NOT review_scope() THEN
  IF NOT EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=actor_id() AND m.organization_id=NEW.organization_id AND m.organization_id=org_id() AND m.status='active' AND m.role IN('agent','agency_manager')) OR NEW.user_id IS DISTINCT FROM actor_id() OR (TG_OP='UPDATE' AND (NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.verified_until IS DISTINCT FROM OLD.verified_until OR NEW.version<>OLD.version+1)) OR (TG_OP='INSERT' AND NEW.verified_until IS NOT NULL) THEN RAISE EXCEPTION 'Public profile authors cannot grant verification or change identity scope' USING ERRCODE='42501'; END IF;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.name<>OLD.name OR NEW.city IS DISTINCT FROM OLD.city THEN NEW.identity_version=OLD.identity_version+1;NEW.verified_until=NULL;ELSE NEW.identity_version=OLD.identity_version;END IF;
 ELSE NEW.identity_version=1;END IF;RETURN NEW;
END $$;
