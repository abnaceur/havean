ALTER TABLE agents ADD COLUMN city text REFERENCES cities(slug),ADD COLUMN identity_version integer NOT NULL DEFAULT 1 CHECK(identity_version>0);
CREATE TABLE agent_credentials(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),agent_id uuid NOT NULL REFERENCES agents,city text NOT NULL REFERENCES cities(slug),
 holder_name text NOT NULL CHECK(length(holder_name) BETWEEN 2 AND 120),registration_reference text NOT NULL CHECK(length(registration_reference) BETWEEN 3 AND 120),issuer text NOT NULL CHECK(length(issuer) BETWEEN 2 AND 160),
 expires_on date NOT NULL,document_id uuid NOT NULL REFERENCES media_assets,profile_identity_version integer NOT NULL CHECK(profile_identity_version>0),
 status text NOT NULL DEFAULT 'submitted' CHECK(status IN('submitted','approved','rejected','revoked','superseded')),version integer NOT NULL DEFAULT 1 CHECK(version>0),
 reviewed_by uuid REFERENCES profiles,review_note text,reviewed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_pending_agent_credential ON agent_credentials(agent_id) WHERE status='submitted';
CREATE UNIQUE INDEX one_approved_agent_credential ON agent_credentials(agent_id) WHERE status='approved';
ALTER TABLE agent_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY private_agent_credential_scope ON agent_credentials USING(staff_scope() OR review_scope() OR agent_id IN(SELECT id FROM agents WHERE user_id=actor_id())) WITH CHECK(staff_scope() OR review_scope() OR agent_id IN(SELECT id FROM agents WHERE user_id=actor_id()));
CREATE TABLE agent_credential_review_grants(reviewer_id uuid NOT NULL REFERENCES profiles,credential_id uuid NOT NULL REFERENCES agent_credentials,expires_at timestamptz NOT NULL,PRIMARY KEY(reviewer_id,credential_id));
ALTER TABLE agent_credential_review_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_credential_reviewer_scope ON agent_credential_review_grants USING((staff_scope() OR review_scope()) AND reviewer_id=actor_id()) WITH CHECK((staff_scope() OR review_scope()) AND reviewer_id=actor_id());
CREATE FUNCTION agent_public_identity_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT staff_scope() AND NOT review_scope() THEN
  IF NOT EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=actor_id() AND m.organization_id=NEW.organization_id AND m.organization_id=actor_org() AND m.status='active' AND m.role IN('agent','agency_manager')) OR NEW.user_id IS DISTINCT FROM actor_id() OR (TG_OP='UPDATE' AND (NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.verified_until IS DISTINCT FROM OLD.verified_until OR NEW.version<>OLD.version+1)) OR (TG_OP='INSERT' AND NEW.verified_until IS NOT NULL) THEN RAISE EXCEPTION 'Public profile authors cannot grant verification or change identity scope' USING ERRCODE='42501'; END IF;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.name<>OLD.name OR NEW.city IS DISTINCT FROM OLD.city THEN NEW.identity_version=OLD.identity_version+1;NEW.verified_until=NULL;ELSE NEW.identity_version=OLD.identity_version;END IF;
 ELSE NEW.identity_version=1;END IF;RETURN NEW;
END $$;
CREATE TRIGGER agent_public_identity_guard BEFORE INSERT OR UPDATE ON agents FOR EACH ROW EXECUTE FUNCTION agent_public_identity_guard();
CREATE FUNCTION agent_credential_state_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE holder agents%ROWTYPE;
BEGIN
 SELECT * INTO holder FROM agents WHERE id=NEW.agent_id;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'submitted' OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.profile_identity_version<>holder.identity_version OR NEW.city IS DISTINCT FROM holder.city OR holder.user_id IS DISTINCT FROM actor_id() THEN RAISE EXCEPTION 'Credentials must be submitted by the actual profile holder' USING ERRCODE='42501'; END IF;
 ELSE
  IF NOT staff_scope() AND NOT review_scope() OR NEW.version<>OLD.version+1 OR NEW.agent_id<>OLD.agent_id OR NEW.city<>OLD.city OR NEW.document_id<>OLD.document_id OR NEW.profile_identity_version<>OLD.profile_identity_version THEN RAISE EXCEPTION 'Independent versioned credential review is required' USING ERRCODE='42501'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
   IF NOT((OLD.status='submitted' AND NEW.status IN('approved','rejected')) OR (OLD.status='approved' AND NEW.status IN('revoked','superseded'))) OR NEW.reviewed_by IS DISTINCT FROM actor_id() OR NEW.reviewed_by=holder.user_id THEN RAISE EXCEPTION 'Invalid credential decision or self-verification' USING ERRCODE='42501'; END IF;
   IF NEW.status='approved' AND (NEW.profile_identity_version<>holder.identity_version OR NEW.expires_on<(SELECT (now() AT TIME ZONE timezone)::date FROM cities WHERE slug=NEW.city)) THEN RAISE EXCEPTION 'Approval requires current identity and unexpired credential' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM media_assets m WHERE m.id=NEW.document_id AND m.owner_id=holder.user_id AND m.status='approved' AND m.visibility='private' AND m.purpose='document' AND m.mime='application/pdf' AND m.scan_at IS NOT NULL) THEN RAISE EXCEPTION 'Credential requires an approved owned private PDF' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER agent_credential_state_guard BEFORE INSERT OR UPDATE ON agent_credentials FOR EACH ROW EXECUTE FUNCTION agent_credential_state_guard();
-- Bounded public read port: legacy expiry metadata never creates an approval badge.
CREATE FUNCTION agent_credential_badge(target uuid,market text) RETURNS TABLE(status text,expires_on date) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN current_record.status='revoked' THEN 'revoked' WHEN current_record.status='approved' AND current_record.profile_identity_version=a.identity_version AND current_record.reviewed_by<>a.user_id AND current_record.expires_on>=(now() AT TIME ZONE ci.timezone)::date THEN 'approved' WHEN current_record.status='approved' AND current_record.expires_on<(now() AT TIME ZONE ci.timezone)::date THEN 'expired' ELSE 'unverified' END,current_record.expires_on
 FROM agents a JOIN profiles p ON p.id=a.user_id AND p.state='active' JOIN cities ci ON ci.slug=market AND ci.status='active'
 LEFT JOIN LATERAL(SELECT c.status,c.expires_on,c.profile_identity_version,c.reviewed_by FROM agent_credentials c WHERE c.agent_id=a.id AND c.city=ci.slug AND c.status IN('approved','revoked') ORDER BY c.reviewed_at DESC,c.id DESC LIMIT 1) current_record ON true WHERE a.id=target
 AND EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=a.user_id AND m.organization_id=a.organization_id AND m.role IN('agent','agency_manager') AND m.status='active')
$$;
REVOKE ALL ON FUNCTION agent_credential_badge(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agent_credential_badge(uuid,text) TO haven_app;
CREATE FUNCTION revoke_agent_credential_grants(target uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT(staff_scope() OR review_scope()) THEN RAISE EXCEPTION 'Reviewer required' USING ERRCODE='42501';END IF;
 DELETE FROM agent_credential_review_grants WHERE credential_id=target;
END $$;
REVOKE ALL ON FUNCTION revoke_agent_credential_grants(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION revoke_agent_credential_grants(uuid) TO haven_app;
CREATE OR REPLACE FUNCTION public_listing_agents(target uuid) RETURNS TABLE(id uuid,name text,slug text,biography text,languages text[],districts text[],"verifiedUntil" date,photo text,"publicEmail" text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT a.id,a.name,a.slug,a.biography,a.languages,a.districts,CASE WHEN badge.status='approved' THEN badge.expires_on ELSE NULL END,a.photo,a.public_email
 FROM public_listings listing JOIN listings l ON l.id=listing.id JOIN agents a ON a.id=l.agent_id AND a.organization_id=l.organization_id JOIN profiles person ON person.id=a.user_id JOIN cities city ON city.slug=listing.city LEFT JOIN LATERAL agent_credential_badge(a.id,listing.city) badge ON true
 WHERE listing.id=target AND person.state='active' AND a.verified_until>=(now() AT TIME ZONE city.timezone)::date
 AND EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=a.user_id AND m.organization_id=a.organization_id AND m.status='active' AND m.role IN('agent','agency_manager'))
$$;
