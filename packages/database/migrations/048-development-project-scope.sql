CREATE TABLE development_phases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),development_id uuid NOT NULL REFERENCES developments,name text NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 120),slug text NOT NULL, status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','coming_soon','on_sale','sold_out')),version integer NOT NULL DEFAULT 1 CHECK(version>0),UNIQUE(development_id,slug));
ALTER TABLE development_phases ENABLE ROW LEVEL SECURITY;
CREATE POLICY development_phase_scope ON development_phases USING(development_id IN(SELECT id FROM developments WHERE organization_id=org_id()) OR staff_scope()) WITH CHECK(development_id IN(SELECT id FROM developments WHERE organization_id=org_id()) OR staff_scope());
CREATE POLICY development_phase_public ON development_phases FOR SELECT USING(status IN('coming_soon','on_sale','sold_out') AND development_id IN(SELECT id FROM developments WHERE status IN('coming_soon','on_sale','sold_out')));
ALTER TABLE buildings ADD COLUMN development_id uuid REFERENCES developments,ADD COLUMN phase_id uuid REFERENCES development_phases;
ALTER TABLE buildings ADD CONSTRAINT building_phase_requires_project CHECK(phase_id IS NULL OR development_id IS NOT NULL);
CREATE INDEX buildings_project ON buildings(development_id,phase_id);
CREATE POLICY development_building_write ON buildings FOR ALL USING(development_id IN(SELECT id FROM developments WHERE organization_id=org_id())) WITH CHECK(development_id IN(SELECT id FROM developments WHERE organization_id=org_id()));
CREATE FUNCTION development_project_parent() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE project developments%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='development_phases' THEN
  IF TG_OP='UPDATE' AND (NEW.development_id<>OLD.development_id OR NEW.slug<>OLD.slug) THEN RAISE EXCEPTION 'Phase project and slug are immutable' USING ERRCODE='23514'; END IF;
 ELSE
  IF TG_OP='UPDATE' AND OLD.development_id IS NOT NULL AND NEW.development_id IS DISTINCT FROM OLD.development_id THEN RAISE EXCEPTION 'Building project is immutable' USING ERRCODE='23514'; END IF;
  IF NEW.development_id IS NOT NULL THEN
   SELECT * INTO project FROM developments WHERE id=NEW.development_id;
   IF project.id IS NULL OR project.community_id<>NEW.community_id OR (NEW.phase_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM development_phases WHERE id=NEW.phase_id AND development_id=project.id)) THEN RAISE EXCEPTION 'Building community and phase must belong to its project' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER development_phase_parent BEFORE INSERT OR UPDATE ON development_phases FOR EACH ROW EXECUTE FUNCTION development_project_parent();
CREATE TRIGGER development_building_parent BEFORE INSERT OR UPDATE ON buildings FOR EACH ROW EXECUTE FUNCTION development_project_parent();
CREATE FUNCTION development_identity_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM organizations WHERE id=NEW.organization_id AND type='developer') THEN RAISE EXCEPTION 'Project requires a developer organization' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (NEW.organization_id<>OLD.organization_id OR NEW.community_id<>OLD.community_id OR NEW.slug<>OLD.slug) THEN RAISE EXCEPTION 'Project organization, community and slug are immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER development_identity BEFORE INSERT OR UPDATE ON developments FOR EACH ROW EXECUTE FUNCTION development_identity_guard();
