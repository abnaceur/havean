-- Owners may read grants but cannot update them. A narrow port acquires the
-- lock without granting them ownership-authorization mutation rights.
CREATE FUNCTION current_owner_unit_grant(target uuid) RETURNS TABLE(id uuid,version integer) LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT g.id,g.version FROM owner_unit_grants g WHERE g.unit_id=target AND g.owner_id=actor_id() AND g.status='active' AND (g.expires_at IS NULL OR g.expires_at>now()) FOR SHARE OF g;
$$;
REVOKE ALL ON FUNCTION current_owner_unit_grant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION current_owner_unit_grant(uuid) TO haven_app;
CREATE OR REPLACE FUNCTION owner_listing_grant_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF actor_id() IS NOT NULL AND NEW.owner_id=actor_id() AND NOT staff_scope() AND NOT review_scope() AND NOT EXISTS(SELECT 1 FROM current_owner_unit_grant(NEW.unit_id)) THEN RAISE EXCEPTION 'A current owner-to-unit grant is required' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
