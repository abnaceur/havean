ALTER TABLE quotes ADD COLUMN provider_version int, ADD COLUMN assigned_vendor_id uuid REFERENCES profiles, ADD COLUMN city text REFERENCES cities(slug), ADD COLUMN district_id uuid REFERENCES districts, ADD COLUMN service_category text, ADD COLUMN currency char(3), ADD COLUMN contact_name text, ADD COLUMN contact_email text, ADD COLUMN contact_phone text, ADD COLUMN consent_at timestamptz, ADD COLUMN policy_version int, ADD COLUMN provider_snapshot jsonb, ADD COLUMN updated_at timestamptz;
ALTER TABLE quotes ADD CONSTRAINT native_quote_facts CHECK(provider_version IS NULL OR (provider_version>0 AND assigned_vendor_id IS NOT NULL AND city IS NOT NULL AND district_id IS NOT NULL AND service_category IS NOT NULL AND currency IS NOT NULL AND contact_name IS NOT NULL AND contact_email IS NOT NULL AND contact_phone IS NOT NULL AND consent_at IS NOT NULL AND policy_version=1 AND provider_snapshot IS NOT NULL));
CREATE FUNCTION quote_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM profiles p JOIN memberships m ON m.user_id=p.id WHERE p.id=actor_id() AND p.state='active' AND m.status='active' AND m.role='admin') $$;
CREATE FUNCTION quote_vendor(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM quotes q JOIN profiles p ON p.id=q.assigned_vendor_id JOIN memberships m ON m.user_id=p.id AND m.organization_id=q.organization_id WHERE q.id=target AND q.provider_version IS NOT NULL AND p.id=actor_id() AND q.organization_id=org_id() AND p.state='active' AND m.status='active' AND m.role='vendor') $$;
CREATE FUNCTION quote_readable(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM quotes q WHERE q.id=target AND (q.user_id=actor_id() OR quote_vendor(q.id) OR quote_admin())) $$;
CREATE FUNCTION quote_destination(target uuid) RETURNS TABLE(organization_id uuid,version int,city text,recipient uuid,snapshot jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE dest record; v providers%ROWTYPE; member uuid; snap jsonb;
BEGIN
 SELECT * INTO dest FROM published_provider_destination(target); IF NOT FOUND THEN RETURN; END IF;
 SELECT * INTO v FROM providers WHERE id=target;
 SELECT p.id INTO member FROM profiles p JOIN memberships m ON m.user_id=p.id AND m.organization_id=v.organization_id WHERE p.state='active' AND m.status='active' AND m.role='vendor' AND (v.owner_id IS NULL OR p.id=v.owner_id) ORDER BY p.id LIMIT 1 FOR SHARE OF p,m;
 IF NOT FOUND THEN RETURN; END IF;
 SELECT jsonb_build_object('id',p.id,'name',p.name,'city',p.city,'version',p.version,'categories',p.categories,'districtIds',p."districtIds") INTO snap FROM public_providers p WHERE p.id=target;
 RETURN QUERY SELECT dest.organization_id,dest.version,dest.city,member,snap;
END $$;
REVOKE ALL ON FUNCTION quote_admin(),quote_vendor(uuid),quote_readable(uuid),quote_destination(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION quote_admin(),quote_vendor(uuid),quote_readable(uuid),quote_destination(uuid) TO haven_app;
DROP POLICY resource_scope ON quotes;
CREATE POLICY quote_read ON quotes FOR SELECT USING(quote_readable(id));
CREATE POLICY quote_create ON quotes FOR INSERT WITH CHECK(user_id=actor_id());
CREATE POLICY quote_update ON quotes FOR UPDATE USING(quote_vendor(id) OR quote_admin()) WITH CHECK(quote_vendor(id) OR quote_admin());
CREATE TABLE quote_activity(quote_id uuid NOT NULL REFERENCES quotes,quote_version int NOT NULL,status text NOT NULL,note text NOT NULL CHECK(length(note) BETWEEN 5 AND 1000),actor_id uuid NOT NULL REFERENCES profiles,at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(quote_id,quote_version));
ALTER TABLE quote_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY quote_activity_read ON quote_activity FOR SELECT USING(quote_readable(quote_id));
CREATE POLICY quote_activity_insert ON quote_activity FOR INSERT WITH CHECK(actor_id=public.actor_id() AND quote_readable(quote_id));
CREATE FUNCTION quote_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE dest record; currency_code text;
BEGIN
 IF current_user<>'haven_app' THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN
 SELECT * INTO dest FROM quote_destination(NEW.provider_id);
 IF NOT FOUND THEN RAISE EXCEPTION 'Unavailable provider' USING ERRCODE='23514'; END IF;
 SELECT currency INTO currency_code FROM cities WHERE slug=dest.city AND status='active' FOR SHARE;
 IF NEW.provider_version IS NULL OR NEW.user_id<>actor_id() OR NEW.organization_id<>dest.organization_id OR NEW.assigned_vendor_id<>dest.recipient OR NEW.provider_version<>dest.version OR NEW.city<>dest.city OR NEW.provider_snapshot<>dest.snapshot OR NOT (dest.snapshot->'categories' ? NEW.service_category) OR NOT (dest.snapshot->'districtIds' ? NEW.district_id::text) OR NEW.currency<>currency_code OR NEW.status<>'requested' OR NEW.version<>1 OR NEW.consent_at IS NULL OR NEW.policy_version<>1 THEN RAISE EXCEPTION 'Invalid quote source or scope' USING ERRCODE='23514'; END IF;
 NEW.updated_at=now();
 ELSE
 IF OLD.provider_version IS NULL OR NOT (quote_vendor(OLD.id) OR quote_admin()) OR NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['status','version','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','updated_at']) OR NOT ((OLD.status='requested' AND NEW.status IN('assigned','contacted','closed')) OR (OLD.status='assigned' AND NEW.status IN('contacted','closed')) OR (OLD.status='contacted' AND NEW.status IN('quoted','closed')) OR (OLD.status='quoted' AND NEW.status='closed')) THEN RAISE EXCEPTION 'Invalid quote transition' USING ERRCODE='23514'; END IF;
 NEW.updated_at=now();
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER quote_guard BEFORE INSERT OR UPDATE ON quotes FOR EACH ROW EXECUTE FUNCTION quote_guard();
CREATE FUNCTION quote_activity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE q quotes%ROWTYPE;
BEGIN
 IF current_user<>'haven_app' THEN RETURN NEW; END IF;
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Quote history is immutable' USING ERRCODE='23514'; END IF;
 SELECT * INTO q FROM quotes WHERE id=NEW.quote_id;
 IF NOT FOUND OR q.provider_version IS NULL OR NEW.actor_id<>actor_id() OR NEW.quote_version<>q.version OR NEW.status<>q.status OR q.updated_at<>now() OR NOT (q.version=1 AND q.user_id=actor_id() OR quote_vendor(q.id) OR quote_admin()) THEN RAISE EXCEPTION 'Invalid quote activity' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER quote_activity_guard BEFORE INSERT OR UPDATE OR DELETE ON quote_activity FOR EACH ROW EXECUTE FUNCTION quote_activity_guard();
GRANT SELECT,INSERT ON quote_activity TO haven_app;
