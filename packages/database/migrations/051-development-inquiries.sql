ALTER TABLE leads ADD COLUMN floor_plan_id uuid REFERENCES floor_plans,ADD COLUMN inquiry_intent text NOT NULL DEFAULT 'general' CHECK(inquiry_intent IN('general','available_unit')),ADD COLUMN resource_version integer,ADD COLUMN floor_plan_version integer;
ALTER TABLE leads ADD CONSTRAINT development_inquiry_fields CHECK((floor_plan_id IS NULL AND floor_plan_version IS NULL AND inquiry_intent='general') OR (resource_type='development' AND floor_plan_id IS NOT NULL AND floor_plan_version>0 AND resource_version>0));
CREATE FUNCTION development_inquiry_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE project developments%ROWTYPE; layout floor_plans%ROWTYPE;
BEGIN
 IF NEW.resource_type<>'development' THEN RETURN NEW; END IF;
 SELECT * INTO project FROM developments WHERE id=NEW.resource_id FOR SHARE;
 IF project.id IS NULL OR project.status NOT IN('coming_soon','on_sale','sold_out') OR project.organization_id IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'Development is unavailable' USING ERRCODE='23514'; END IF;
 IF NEW.resource_version IS NOT NULL AND project.version<>NEW.resource_version THEN RAISE EXCEPTION 'Development changed' USING ERRCODE='23514'; END IF;
 IF NEW.floor_plan_id IS NOT NULL THEN
  SELECT * INTO layout FROM floor_plans WHERE id=NEW.floor_plan_id AND development_id=project.id AND publication_status='published' FOR SHARE;
  IF layout.id IS NULL OR layout.version<>NEW.floor_plan_version THEN RAISE EXCEPTION 'Selected unit type changed or is unavailable' USING ERRCODE='23514'; END IF;
  IF NEW.inquiry_intent='available_unit' AND (project.status<>'on_sale' OR layout.available<=0) THEN RAISE EXCEPTION 'No units are currently available' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER development_inquiry_guard BEFORE INSERT ON leads FOR EACH ROW EXECUTE FUNCTION development_inquiry_guard();
