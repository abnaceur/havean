-- Use the existing canonical manager organization type. Applied grant history remains unchanged.
CREATE OR REPLACE FUNCTION management_team(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM profiles p JOIN memberships m ON m.user_id=p.id JOIN organizations o ON o.id=m.organization_id WHERE p.id=actor_id() AND p.state='active' AND m.status='active' AND m.role IN('property_manager','finance') AND m.organization_id=target AND target=org_id() AND o.type='manager') $$;
CREATE OR REPLACE FUNCTION management_destination(target uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE label text;
BEGIN
 SELECT o.name INTO label FROM organizations o JOIN memberships m ON m.organization_id=o.id JOIN profiles p ON p.id=m.user_id WHERE o.id=target AND o.type='manager' AND m.status='active' AND m.role='property_manager' AND p.state='active' ORDER BY p.id LIMIT 1 FOR SHARE OF o,m,p;
 RETURN label;
END $$;
CREATE OR REPLACE FUNCTION management_unit_grant_lock(target uuid,organization uuid) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE source management_grants%ROWTYPE;
BEGIN
 PERFORM 1 FROM profiles p JOIN memberships m ON m.user_id=p.id WHERE p.id=actor_id() AND p.state='active' AND m.status='active' AND (m.role='admin' OR m.organization_id=organization AND organization=org_id() AND m.role IN('property_manager','finance')) ORDER BY m.id LIMIT 1 FOR SHARE OF p,m;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT g.* INTO source FROM management_grants g JOIN organizations o ON o.id=g.organization_id AND o.type='manager' WHERE g.unit_id=target AND g.organization_id=organization AND management_grant_valid(g.id) FOR SHARE OF g;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF source.owner_authority_id IS NOT NULL THEN
 PERFORM 1 FROM owner_unit_grants a WHERE a.id=source.owner_authority_id AND a.version=source.owner_authority_version AND a.owner_id=source.owner_id AND a.unit_id=source.unit_id AND a.status='active' AND (a.expires_at IS NULL OR a.expires_at>statement_timestamp()) FOR SHARE OF a;
 IF NOT FOUND THEN RETURN NULL; END IF;
 END IF;
 RETURN source.version;
END $$;
