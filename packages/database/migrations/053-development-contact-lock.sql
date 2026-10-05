-- Public callers can SELECT published inventory but cannot acquire a direct
-- UPDATE-policy row lock. This narrow internal destination function locks
-- only eligible public projects/types and never returns individual unit data.
CREATE FUNCTION published_development_destination(project_id uuid,type_id uuid DEFAULT NULL) RETURNS TABLE(organization_id uuid,version integer,status text,floor_plan_version integer,available integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE project developments%ROWTYPE; layout floor_plans%ROWTYPE;
BEGIN
 SELECT * INTO project FROM developments d WHERE d.id=project_id AND d.status IN('coming_soon','on_sale','sold_out') FOR SHARE;
 IF project.id IS NULL THEN RETURN; END IF;
 IF type_id IS NOT NULL THEN SELECT * INTO layout FROM floor_plans f WHERE f.id=type_id AND f.development_id=project.id AND f.publication_status='published' FOR SHARE; END IF;
 RETURN QUERY SELECT project.organization_id,project.version,project.status,layout.version,layout.available;
END $$;
