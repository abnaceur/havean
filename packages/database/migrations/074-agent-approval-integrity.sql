CREATE OR REPLACE FUNCTION agent_credential_state_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE holder agents%ROWTYPE;
BEGIN
 SELECT * INTO holder FROM agents WHERE id=NEW.agent_id;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'submitted' OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.profile_identity_version<>holder.identity_version OR NEW.city IS DISTINCT FROM holder.city OR holder.user_id IS DISTINCT FROM actor_id() THEN RAISE EXCEPTION 'Credentials must be submitted by the actual profile holder' USING ERRCODE='42501'; END IF;
 ELSE
  IF holder.user_id=actor_id() OR NOT staff_scope() AND NOT review_scope() OR NEW.version<>OLD.version+1 OR NEW.agent_id<>OLD.agent_id OR NEW.city<>OLD.city OR NEW.document_id<>OLD.document_id OR NEW.profile_identity_version<>OLD.profile_identity_version THEN RAISE EXCEPTION 'Independent versioned credential review is required' USING ERRCODE='42501'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
   IF NOT((OLD.status='submitted' AND NEW.status IN('approved','rejected')) OR (OLD.status='approved' AND NEW.status IN('revoked','superseded'))) OR NEW.reviewed_by IS DISTINCT FROM actor_id() OR NEW.reviewed_by=holder.user_id THEN RAISE EXCEPTION 'Invalid credential decision or self-verification' USING ERRCODE='42501'; END IF;
   IF NEW.status='approved' AND (NEW.profile_identity_version<>holder.identity_version OR NEW.expires_on<(SELECT (now() AT TIME ZONE timezone)::date FROM cities WHERE slug=NEW.city)) THEN RAISE EXCEPTION 'Approval requires current identity and unexpired credential' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM media_assets m WHERE m.id=NEW.document_id AND m.owner_id=holder.user_id AND m.status='approved' AND m.visibility='private' AND m.purpose='document' AND m.mime='application/pdf' AND m.scan_at IS NOT NULL) THEN RAISE EXCEPTION 'Credential requires an approved owned private PDF' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION agent_credential_badge(target uuid,market text) RETURNS TABLE(status text,expires_on date) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN current_record.status='revoked' THEN 'revoked' WHEN current_record.status='approved' AND current_record.profile_identity_version=a.identity_version AND current_record.reviewed_by<>a.user_id AND EXISTS(SELECT 1 FROM media_assets evidence WHERE evidence.id=current_record.document_id AND evidence.owner_id=a.user_id AND evidence.visibility='private' AND evidence.status='approved' AND evidence.mime='application/pdf' AND evidence.purpose='document' AND evidence.scan_at IS NOT NULL) AND current_record.expires_on>=(now() AT TIME ZONE ci.timezone)::date THEN 'approved' WHEN current_record.status='approved' AND current_record.expires_on<(now() AT TIME ZONE ci.timezone)::date THEN 'expired' ELSE 'unverified' END,current_record.expires_on
 FROM agents a JOIN profiles p ON p.id=a.user_id AND p.state='active' JOIN cities ci ON ci.slug=market AND ci.status='active'
 LEFT JOIN LATERAL(SELECT c.status,c.expires_on,c.profile_identity_version,c.reviewed_by,c.document_id FROM agent_credentials c WHERE c.agent_id=a.id AND c.city=ci.slug AND c.status IN('approved','revoked') ORDER BY c.reviewed_at DESC,c.id DESC LIMIT 1) current_record ON true WHERE a.id=target
 AND EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=a.user_id AND m.organization_id=a.organization_id AND m.role IN('agent','agency_manager') AND m.status='active')
$$;
CREATE FUNCTION agent_credential_delete_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN IF NOT(staff_scope() OR review_scope()) THEN RAISE EXCEPTION 'Credential history requires authorized retention review' USING ERRCODE='42501';END IF;RETURN OLD;END $$;
CREATE TRIGGER agent_credential_delete_guard BEFORE DELETE ON agent_credentials FOR EACH ROW EXECUTE FUNCTION agent_credential_delete_guard();
