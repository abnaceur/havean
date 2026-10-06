-- Invitation recipients may see the bounded community label even before a lease or public listing exists.
CREATE FUNCTION tenant_invitation_community(target uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT co.name FROM tenant_invitations i JOIN units u ON u.id=i.unit_id JOIN communities co ON co.id=u.community_id WHERE i.id=target AND (tenant_invitation_recipient(i.email) OR management_admin() OR management_team(i.organization_id) AND management_grant_valid(i.grant_id)) $$;
REVOKE ALL ON FUNCTION tenant_invitation_community(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenant_invitation_community(uuid) TO haven_app;
