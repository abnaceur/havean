-- Read authority is current and exact to the lease organization, not merely an
-- unexpired grant on the same unit. Owner source authorization remains inventory owned.
CREATE FUNCTION owner_statement_unit_valid(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM owner_unit_grants g WHERE g.unit_id=target AND g.owner_id=actor_id() AND g.status='active' AND (g.expires_at IS NULL OR g.expires_at>statement_timestamp())) $$;
CREATE FUNCTION management_owner_lease_access(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM leases l JOIN management_grants g ON g.unit_id=l.unit_id AND g.organization_id=l.organization_id JOIN profiles p ON p.id=g.owner_id WHERE l.id=target AND l.status IN('active','ended') AND p.id=actor_id() AND p.state='active' AND management_grant_valid(g.id) AND owner_statement_unit_valid(l.unit_id))
$$;
CREATE FUNCTION management_statement_lock(target uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE l leases%ROWTYPE;g management_grants%ROWTYPE;
BEGIN
 PERFORM 1 FROM profiles WHERE id=actor_id() AND state='active' FOR SHARE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO l FROM leases WHERE id=target AND status IN('active','ended') FOR SHARE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF tenant_lease_lock(target) THEN RETURN 'tenant';END IF;
 IF management_owner_lease_access(target) THEN
  SELECT * INTO g FROM management_grants WHERE unit_id=l.unit_id AND organization_id=l.organization_id AND owner_id=actor_id() AND management_grant_valid(id) FOR SHARE;
  IF FOUND AND owner_management_unit(l.unit_id) IS NOT NULL AND management_grant_valid(g.id) THEN RETURN 'owner';END IF;
 END IF;
 IF (management_inviter_lock(l.organization_id) OR management_finance_lock(l.organization_id) OR management_admin()) AND management_unit_grant_lock(l.unit_id,l.organization_id) IS NOT NULL THEN RETURN 'professional';END IF;
 RETURN NULL;
END $$;
ALTER POLICY owner_leases ON leases USING(management_owner_lease_access(id));
REVOKE ALL ON FUNCTION owner_statement_unit_valid(uuid),management_owner_lease_access(uuid),management_statement_lock(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION owner_statement_unit_valid(uuid),management_owner_lease_access(uuid),management_statement_lock(uuid) TO haven_app;
