CREATE TABLE owner_unit_grants(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),unit_id uuid NOT NULL REFERENCES units,owner_id uuid NOT NULL REFERENCES profiles,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','revoked')),version integer NOT NULL DEFAULT 1 CHECK(version>0),
 source text NOT NULL CHECK(source IN('recorded_listing','reviewed_submission')),source_listing_id uuid NOT NULL REFERENCES listings,
 verified_by uuid REFERENCES profiles,expires_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(unit_id,owner_id)
);
INSERT INTO owner_unit_grants(unit_id,owner_id,source,source_listing_id) SELECT DISTINCT ON(unit_id,owner_id) unit_id,owner_id,'recorded_listing',id FROM listings WHERE owner_id IS NOT NULL ORDER BY unit_id,owner_id,created_at,id;
ALTER TABLE owner_unit_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_grant_read ON owner_unit_grants FOR SELECT USING(owner_id=actor_id() OR staff_scope() OR review_scope());
CREATE POLICY owner_grant_write ON owner_unit_grants FOR ALL USING(staff_scope() OR review_scope()) WITH CHECK(staff_scope() OR review_scope());
CREATE FUNCTION owner_unit_grant_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM listings l WHERE l.id=NEW.source_listing_id AND l.unit_id=NEW.unit_id AND l.owner_id=NEW.owner_id) THEN RAISE EXCEPTION 'Owner grant requires a recorded server-owned relationship' USING ERRCODE='23514'; END IF;
 IF NEW.source='reviewed_submission' AND NEW.verified_by IS NULL THEN RAISE EXCEPTION 'Reviewed grant requires its reviewer' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (NEW.unit_id<>OLD.unit_id OR NEW.owner_id<>OLD.owner_id OR NEW.source<>OLD.source OR NEW.source_listing_id<>OLD.source_listing_id OR NEW.verified_by IS DISTINCT FROM OLD.verified_by OR NEW.version<>OLD.version+1) THEN RAISE EXCEPTION 'Grant identity is immutable and changes require a new version' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER owner_unit_grant_guard BEFORE INSERT OR UPDATE ON owner_unit_grants FOR EACH ROW EXECUTE FUNCTION owner_unit_grant_guard();
CREATE TABLE listing_owner_contacts(listing_id uuid PRIMARY KEY REFERENCES listings ON DELETE CASCADE,owner_id uuid NOT NULL REFERENCES profiles,contact text NOT NULL DEFAULT '' CHECK(length(contact)<=100),audience text NOT NULL DEFAULT 'reviewers_only' CHECK(audience IN('reviewers_only','assigned_team')),version int NOT NULL DEFAULT 1 CHECK(version>0));
ALTER TABLE listing_owner_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_contact_read ON listing_owner_contacts FOR SELECT USING(owner_id=actor_id() OR staff_scope() OR review_scope() OR (audience='assigned_team' AND EXISTS(SELECT 1 FROM listings l WHERE l.id=listing_id AND l.organization_id=org_id() AND (NOT agent_only() OR l.agent_id IN(SELECT id FROM agents WHERE user_id=actor_id())))));
CREATE POLICY owner_contact_write ON listing_owner_contacts FOR ALL USING(owner_id=actor_id() OR staff_scope()) WITH CHECK(owner_id=actor_id() OR staff_scope());
CREATE FUNCTION owner_contact_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM listings l WHERE l.id=NEW.listing_id AND l.owner_id=NEW.owner_id) THEN RAISE EXCEPTION 'Contact requires the listing owner' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (NEW.listing_id<>OLD.listing_id OR NEW.owner_id<>OLD.owner_id OR NEW.version<>OLD.version+1) THEN RAISE EXCEPTION 'Contact identity is immutable and changes require a new version' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER owner_contact_guard BEFORE INSERT OR UPDATE ON listing_owner_contacts FOR EACH ROW EXECUTE FUNCTION owner_contact_guard();
CREATE FUNCTION owner_listing_grant_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF actor_id() IS NOT NULL AND NEW.owner_id=actor_id() AND NOT staff_scope() AND NOT review_scope() AND NOT EXISTS(SELECT 1 FROM owner_unit_grants g WHERE g.unit_id=NEW.unit_id AND g.owner_id=actor_id() AND g.status='active' AND (g.expires_at IS NULL OR g.expires_at>now())) THEN RAISE EXCEPTION 'A current owner-to-unit grant is required' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER owner_listing_grant_guard BEFORE INSERT OR UPDATE ON listings FOR EACH ROW EXECUTE FUNCTION owner_listing_grant_guard();
