ALTER TABLE floor_plans ADD COLUMN area_min numeric(10,2),ADD COLUMN area_max numeric(10,2),ADD COLUMN baths integer CHECK(baths BETWEEN 0 AND 20),ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0),ADD COLUMN publication_status text NOT NULL DEFAULT 'published' CHECK(publication_status IN('draft','published','withdrawn')),ADD COLUMN published_at timestamptz,ADD COLUMN inventory_mode text NOT NULL DEFAULT 'legacy_count' CHECK(inventory_mode IN('legacy_count','units'));
UPDATE floor_plans SET area_min=area,area_max=area,published_at=(SELECT inventory_at FROM developments WHERE id=development_id);
ALTER TABLE floor_plans ALTER COLUMN area_min SET NOT NULL,ALTER COLUMN area_max SET NOT NULL,ADD CONSTRAINT floor_type_area_range CHECK(area_min>0 AND area_max>=area_min),ADD CONSTRAINT floor_type_rooms CHECK(beds BETWEEN 0 AND 20 AND living_rooms BETWEEN 0 AND 20);
CREATE TABLE development_offered_units(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),development_id uuid NOT NULL REFERENCES developments,floor_plan_id uuid NOT NULL REFERENCES floor_plans,unit_id uuid UNIQUE NOT NULL REFERENCES units,unit_label text NOT NULL CHECK(length(trim(unit_label)) BETWEEN 1 AND 80),status text NOT NULL CHECK(status IN('available','reserved','sold','withdrawn')),version integer NOT NULL DEFAULT 1 CHECK(version>0),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(development_id,unit_label));
ALTER TABLE development_offered_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY offered_unit_scope ON development_offered_units USING(development_id IN(SELECT id FROM developments WHERE organization_id=org_id()) OR staff_scope()) WITH CHECK(development_id IN(SELECT id FROM developments WHERE organization_id=org_id()) OR staff_scope());
CREATE POLICY developer_project_units ON units FOR ALL USING(building_id IN(SELECT id FROM buildings WHERE development_id IN(SELECT id FROM developments WHERE organization_id=org_id()))) WITH CHECK(building_id IN(SELECT id FROM buildings WHERE development_id IN(SELECT id FROM developments WHERE organization_id=org_id())) AND unit_kind='property');
CREATE FUNCTION development_inventory_parent() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE plan floor_plans%ROWTYPE; item units%ROWTYPE;
BEGIN
 SELECT * INTO plan FROM floor_plans WHERE id=NEW.floor_plan_id; SELECT * INTO item FROM units WHERE id=NEW.unit_id;
 IF plan.development_id IS DISTINCT FROM NEW.development_id OR plan.inventory_mode<>'units' OR item.unit_kind<>'property' OR item.area<plan.area_min OR item.area>plan.area_max OR item.beds<>plan.beds OR item.living_rooms<>plan.living_rooms OR (plan.baths IS NOT NULL AND item.baths<>plan.baths) OR NOT EXISTS(SELECT 1 FROM buildings WHERE id=item.building_id AND development_id=NEW.development_id) THEN RAISE EXCEPTION 'Offered unit must match its project, building and floor-plan range' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (NEW.unit_id<>OLD.unit_id OR NEW.floor_plan_id<>OLD.floor_plan_id OR NEW.development_id<>OLD.development_id) THEN RAISE EXCEPTION 'Offered unit identity is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER offered_unit_parent BEFORE INSERT OR UPDATE ON development_offered_units FOR EACH ROW EXECUTE FUNCTION development_inventory_parent();
CREATE FUNCTION development_type_parent() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.development_id IS DISTINCT FROM OLD.development_id OR NEW.inventory_mode<>OLD.inventory_mode) THEN RAISE EXCEPTION 'Floor-plan project and inventory mode are immutable' USING ERRCODE='23514'; END IF;
 IF NEW.inventory_mode='units' AND NEW.available<>(SELECT count(*) FROM development_offered_units WHERE floor_plan_id=NEW.id AND status='available') THEN RAISE EXCEPTION 'Availability must equal individual offered inventory' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM development_offered_units offer JOIN units u ON u.id=offer.unit_id WHERE offer.floor_plan_id=NEW.id AND (u.area<NEW.area_min OR u.area>NEW.area_max OR u.beds<>NEW.beds OR u.living_rooms<>NEW.living_rooms OR (NEW.baths IS NOT NULL AND u.baths<>NEW.baths))) THEN RAISE EXCEPTION 'Floor-plan change does not match existing offered units' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER development_type_parent BEFORE INSERT OR UPDATE ON floor_plans FOR EACH ROW EXECUTE FUNCTION development_type_parent();
CREATE FUNCTION refresh_offered_inventory() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE plan_id uuid; project_id uuid;
BEGIN
 plan_id:=CASE WHEN TG_OP='DELETE' THEN OLD.floor_plan_id ELSE NEW.floor_plan_id END;
 UPDATE floor_plans SET available=(SELECT count(*) FROM development_offered_units WHERE floor_plan_id=plan_id AND status='available') WHERE id=plan_id RETURNING development_id INTO project_id;
 UPDATE developments SET inventory_at=now() WHERE id=project_id;
 RETURN NULL;
END $$;
CREATE TRIGGER offered_inventory_count AFTER INSERT OR UPDATE OR DELETE ON development_offered_units FOR EACH ROW EXECUTE FUNCTION refresh_offered_inventory();
DROP POLICY plan_read ON floor_plans;
CREATE POLICY plan_read ON floor_plans FOR SELECT USING((publication_status='published' AND development_id IN(SELECT id FROM developments WHERE status IN('coming_soon','on_sale','sold_out'))) OR development_id IN(SELECT id FROM developments WHERE organization_id=org_id()) OR staff_scope() OR review_scope());
