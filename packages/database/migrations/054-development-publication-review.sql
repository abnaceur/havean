CREATE TABLE development_publication(development_id uuid PRIMARY KEY REFERENCES developments ON DELETE CASCADE,state text NOT NULL DEFAULT 'draft' CHECK(state IN('draft','submitted','approved','rejected','legacy_published')),version integer NOT NULL DEFAULT 1 CHECK(version>0),base_version integer NOT NULL DEFAULT 1,submitted_by uuid REFERENCES profiles,submitted_at timestamptz,reviewed_by uuid REFERENCES profiles,reviewed_at timestamptz,reason text NOT NULL DEFAULT '',requested_status text NOT NULL DEFAULT 'coming_soon' CHECK(requested_status IN('coming_soon','on_sale')));
ALTER TABLE development_publication ENABLE ROW LEVEL SECURITY;
CREATE POLICY development_publication_scope ON development_publication USING(development_id IN(SELECT id FROM developments WHERE organization_id=org_id()) OR staff_scope() OR review_scope()) WITH CHECK(development_id IN(SELECT id FROM developments WHERE organization_id=org_id()) OR staff_scope() OR review_scope());
INSERT INTO development_publication(development_id,state,base_version,reason) SELECT id,CASE WHEN status IN('coming_soon','on_sale','sold_out') THEN 'legacy_published' ELSE 'draft' END,version,CASE WHEN status IN('coming_soon','on_sale','sold_out') THEN 'Existing local inventory predates project review; independent project approval is not claimed.' ELSE '' END FROM developments;
CREATE FUNCTION development_publication_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'draft' THEN RAISE EXCEPTION 'New projects require independent publication review' USING ERRCODE='23514'; END IF;
 ELSIF (NEW.name,NEW.description,NEW.community_id,NEW.price_min,NEW.price_max,NEW.price_basis,NEW.currency,NEW.completion_date,NEW.features) IS DISTINCT FROM (OLD.name,OLD.description,OLD.community_id,OLD.price_min,OLD.price_max,OLD.price_basis,OLD.currency,OLD.completion_date,OLD.features) THEN
  UPDATE development_publication SET state='draft',version=version+1,reason='',reviewed_by=NULL,reviewed_at=NULL WHERE development_id=NEW.id AND state<>'draft';
  NEW.status:='draft';
 END IF;
 IF NEW.status IN('coming_soon','on_sale','sold_out') AND NOT EXISTS(SELECT 1 FROM development_publication WHERE development_id=NEW.id AND state IN('approved','legacy_published')) THEN RAISE EXCEPTION 'Development publication requires independent approval' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER development_publication_guard BEFORE INSERT OR UPDATE ON developments FOR EACH ROW EXECUTE FUNCTION development_publication_guard();
CREATE FUNCTION development_publication_initial() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN INSERT INTO development_publication(development_id) VALUES(NEW.id);RETURN NULL;END $$;
CREATE TRIGGER development_publication_initial AFTER INSERT ON developments FOR EACH ROW EXECUTE FUNCTION development_publication_initial();
CREATE FUNCTION development_child_review_invalidated() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE project_id uuid;
BEGIN
 IF TG_TABLE_NAME='floor_plans' AND TG_OP='UPDATE' THEN
  -- Derived availability and independently moderated media do not need a
  -- second project review. Authored type facts/publication do.
  IF (NEW.name,NEW.beds,NEW.living_rooms,NEW.baths,NEW.area_min,NEW.area_max,NEW.publication_status) IS NOT DISTINCT FROM (OLD.name,OLD.beds,OLD.living_rooms,OLD.baths,OLD.area_min,OLD.area_max,OLD.publication_status) THEN RETURN NULL; END IF;
 END IF;
 project_id:=CASE WHEN TG_OP='DELETE' THEN OLD.development_id ELSE NEW.development_id END;
 IF project_id IS NULL THEN RETURN NULL; END IF;
 UPDATE development_publication SET state='draft',version=version+1,reason='',reviewed_by=NULL,reviewed_at=NULL WHERE development_id=project_id AND state<>'draft';
 IF FOUND THEN UPDATE developments SET status='draft',version=version+1 WHERE id=project_id; END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER development_type_review_invalidated AFTER INSERT OR UPDATE OR DELETE ON floor_plans FOR EACH ROW EXECUTE FUNCTION development_child_review_invalidated();
CREATE TRIGGER development_phase_review_invalidated AFTER INSERT OR UPDATE OR DELETE ON development_phases FOR EACH ROW EXECUTE FUNCTION development_child_review_invalidated();
CREATE TRIGGER development_building_review_invalidated AFTER INSERT OR UPDATE OR DELETE ON buildings FOR EACH ROW EXECUTE FUNCTION development_child_review_invalidated();
CREATE FUNCTION development_review_actor_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.state='approved' AND (TG_OP='INSERT' OR OLD.state<>'approved') THEN
  IF NOT (review_scope() OR staff_scope()) OR NEW.reviewed_by IS DISTINCT FROM actor_id() OR NEW.submitted_by=actor_id() OR EXISTS(SELECT 1 FROM developments WHERE id=NEW.development_id AND organization_id=org_id()) THEN RAISE EXCEPTION 'Independent project review is required' USING ERRCODE='42501'; END IF;
 END IF;
 IF NEW.state='legacy_published' AND (TG_OP='INSERT' OR OLD.state<>'legacy_published') AND NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=session_user AND rolsuper) THEN RAISE EXCEPTION 'Legacy fixture import is restricted to database bootstrap' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER development_review_actor_guard BEFORE INSERT OR UPDATE ON development_publication FOR EACH ROW EXECUTE FUNCTION development_review_actor_guard();
