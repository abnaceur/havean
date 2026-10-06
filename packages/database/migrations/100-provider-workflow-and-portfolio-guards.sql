CREATE TABLE provider_review_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),provider_id uuid NOT NULL REFERENCES providers,actor_id uuid NOT NULL REFERENCES profiles,decision text NOT NULL CHECK(decision IN('approved','rejected','revoked')),provider_version int NOT NULL,reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 1000),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(provider_id,provider_version));
ALTER TABLE provider_review_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY provider_review_history_read ON provider_review_history FOR SELECT USING(provider_owned(provider_id) OR provider_reviewer());
GRANT SELECT ON provider_review_history TO haven_app;
CREATE FUNCTION provider_facts_valid(target providers) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT length((target).name) BETWEEN 2 AND 120 AND length((target).description) BETWEEN 20 AND 3000 AND (target).city IS NOT NULL AND cardinality((target).categories) BETWEEN 1 AND 7 AND (target).categories<@ARRAY['Interior design','Renovation','Kitchen renovation','Bathroom renovation','Painting','Repairs','Landscaping']::text[] AND cardinality((target).categories)=(SELECT count(DISTINCT v) FROM unnest((target).categories) v) AND cardinality((target).district_ids) BETWEEN 1 AND 20 AND cardinality((target).district_ids)=(SELECT count(DISTINCT v) FROM unnest((target).district_ids) v) AND cardinality((target).district_ids)=(SELECT count(*) FROM districts d JOIN cities ci ON ci.id=d.city_id WHERE ci.slug=(target).city AND ci.status='active' AND d.status='active' AND d.id=ANY((target).district_ids)) AND ARRAY(SELECT d.name FROM districts d WHERE d.id=ANY((target).district_ids) ORDER BY d.name,d.id)=(target).districts AND cardinality((target).photos)=0
$$;
CREATE FUNCTION provider_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE is_owner boolean;is_reviewer boolean;
BEGIN
 IF staff_scope() THEN RETURN NEW;END IF;
 is_owner=NEW.owner_id=actor_id() AND NEW.organization_id=org_id() AND EXISTS(SELECT 1 FROM profiles p JOIN memberships m ON m.user_id=p.id AND m.organization_id=NEW.organization_id JOIN organizations o ON o.id=m.organization_id AND o.type='vendor' WHERE p.id=actor_id() AND p.state='active' AND m.status='active' AND m.role='vendor');is_reviewer=provider_reviewer() AND NEW.owner_id<>actor_id();
 IF TG_OP='INSERT' THEN
  IF NOT coalesce(is_owner,false) OR NEW.status<>'draft' OR NEW.version<>1 OR NEW.provenance<>'native' OR NEW.reviewed_by IS NOT NULL OR NOT provider_facts_valid(NEW) THEN RAISE EXCEPTION 'Owned draft provider and canonical service areas required' USING ERRCODE='42501';END IF;
 ELSE
  IF (NEW.id,NEW.owner_id,NEW.organization_id,NEW.slug) IS DISTINCT FROM (OLD.id,OLD.owner_id,OLD.organization_id,OLD.slug) OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Provider scope and version are immutable' USING ERRCODE='23514';END IF;
  IF coalesce(is_owner,false) THEN
   IF NOT ((OLD.status IN('draft','rejected','approved','revoked') AND NEW.status='draft') OR OLD.status='draft' AND NEW.status='submitted' OR OLD.status='submitted' AND NEW.status='draft') OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.review_note IS NOT NULL OR NEW.provenance<>'native' OR NOT provider_facts_valid(NEW) THEN RAISE EXCEPTION 'Invalid provider authoring transition' USING ERRCODE='23514';END IF;
  ELSIF coalesce(is_reviewer,false) THEN
   IF NOT (OLD.status='submitted' AND NEW.status IN('approved','rejected') OR OLD.status='approved' AND NEW.status='revoked') OR (NEW.name,NEW.description,NEW.city,NEW.categories,NEW.district_ids,NEW.districts,NEW.photos) IS DISTINCT FROM (OLD.name,OLD.description,OLD.city,OLD.categories,OLD.district_ids,OLD.districts,OLD.photos) OR NEW.reviewed_by<>actor_id() OR NEW.reviewed_at IS NULL OR length(NEW.review_note)<5 OR NEW.provenance<>'independent_review' THEN RAISE EXCEPTION 'Independent versioned provider decision required' USING ERRCODE='42501';END IF;
  ELSE RAISE EXCEPTION 'Actual provider owner or independent reviewer required' USING ERRCODE='42501';END IF;
 END IF;
 IF NEW.status IN('submitted','approved') THEN
  IF NOT EXISTS(SELECT 1 FROM provider_portfolio pm WHERE pm.provider_id=NEW.id) OR EXISTS(SELECT 1 FROM provider_portfolio pm LEFT JOIN media_assets a ON a.id=pm.asset_id AND a.owner_id=NEW.owner_id AND a.status='approved' AND a.visibility='public' AND a.purpose='photo' AND a.scan_at IS NOT NULL AND a.version=pm.asset_version WHERE pm.provider_id=NEW.id AND a.id IS NULL) THEN RAISE EXCEPTION 'Owned scanned portfolio with rights required' USING ERRCODE='23514';END IF;
 END IF;RETURN NEW;
END $$;
-- Guard applies to runtime writes, while migration-owner seed/imports remain explicit.
REVOKE ALL ON FUNCTION provider_guard(),provider_facts_valid(providers) FROM PUBLIC;
CREATE TRIGGER provider_guard BEFORE INSERT OR UPDATE ON providers FOR EACH ROW WHEN(current_user='haven_app') EXECUTE FUNCTION provider_guard();
CREATE FUNCTION provider_review_record() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.status IN('approved','rejected','revoked') AND NEW.reviewed_by IS NOT NULL AND (NEW.status,NEW.version) IS DISTINCT FROM (OLD.status,OLD.version) THEN INSERT INTO provider_review_history(provider_id,actor_id,decision,provider_version,reason) VALUES(NEW.id,NEW.reviewed_by,NEW.status,NEW.version,NEW.review_note);END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION provider_review_record() FROM PUBLIC;
CREATE TRIGGER provider_review_record AFTER UPDATE ON providers FOR EACH ROW EXECUTE FUNCTION provider_review_record();
CREATE FUNCTION provider_portfolio_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE source providers%ROWTYPE;target uuid;
BEGIN
 IF staff_scope() THEN IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;
 IF TG_OP='DELETE' THEN target=OLD.provider_id;ELSE target=NEW.provider_id;END IF;
 SELECT * INTO source FROM providers p WHERE p.id=target AND provider_owned(p.id) FOR UPDATE;
 IF NOT FOUND OR source.status<>'draft' THEN RAISE EXCEPTION 'Current owned draft provider required' USING ERRCODE='42501';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;
 IF TG_OP='UPDATE' AND (NEW.provider_id,NEW.asset_id) IS DISTINCT FROM (OLD.provider_id,OLD.asset_id) THEN RAISE EXCEPTION 'Portfolio scope is immutable' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM media_assets a WHERE a.id=NEW.asset_id AND a.owner_id=source.owner_id AND a.status='approved' AND a.visibility='public' AND a.purpose='photo' AND a.scan_at IS NOT NULL AND a.version=NEW.asset_version FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Owned scanned public photo and version required' USING ERRCODE='42501';END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION provider_portfolio_guard() FROM PUBLIC;
CREATE TRIGGER provider_portfolio_guard BEFORE INSERT OR UPDATE OR DELETE ON provider_portfolio FOR EACH ROW EXECUTE FUNCTION provider_portfolio_guard();
