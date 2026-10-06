-- City locks run inside the bounded service destination port; consumer city SELECT does not require administration UPDATE scope.
CREATE OR REPLACE FUNCTION quote_destination(target uuid) RETURNS TABLE(organization_id uuid,version int,city text,recipient uuid,snapshot jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE dest record; v providers%ROWTYPE; member uuid; snap jsonb; market_currency text;
BEGIN
 SELECT * INTO dest FROM published_provider_destination(target); IF NOT FOUND THEN RETURN; END IF;
 SELECT * INTO v FROM providers WHERE id=target;
 SELECT p.id INTO member FROM profiles p JOIN memberships m ON m.user_id=p.id AND m.organization_id=v.organization_id WHERE p.state='active' AND m.status='active' AND m.role='vendor' AND (v.owner_id IS NULL OR p.id=v.owner_id) ORDER BY p.id LIMIT 1 FOR SHARE OF p,m;
 IF NOT FOUND THEN RETURN; END IF;
 SELECT currency INTO market_currency FROM cities WHERE slug=dest.city AND status='active' FOR SHARE; IF NOT FOUND THEN RETURN; END IF;
 SELECT jsonb_build_object('currency',market_currency,'id',p.id,'name',p.name,'city',p.city,'version',p.version,'categories',p.categories,'districtIds',p."districtIds") INTO snap FROM public_providers p WHERE p.id=target;
 RETURN QUERY SELECT dest.organization_id,dest.version,dest.city,member,snap;
END $$;
CREATE OR REPLACE FUNCTION quote_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE dest record; currency_code text;
BEGIN
 IF current_user<>'haven_app' THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN
 SELECT * INTO dest FROM quote_destination(NEW.provider_id);
 IF NOT FOUND THEN RAISE EXCEPTION 'Unavailable provider' USING ERRCODE='23514'; END IF;
 currency_code=dest.snapshot->>'currency';
 IF NEW.provider_version IS NULL OR NEW.user_id<>actor_id() OR NEW.organization_id<>dest.organization_id OR NEW.assigned_vendor_id<>dest.recipient OR NEW.provider_version<>dest.version OR NEW.city<>dest.city OR NEW.provider_snapshot<>dest.snapshot OR NOT (dest.snapshot->'categories' ? NEW.service_category) OR NOT (dest.snapshot->'districtIds' ? NEW.district_id::text) OR NEW.currency<>currency_code OR NEW.status<>'requested' OR NEW.version<>1 OR NEW.consent_at IS NULL OR NEW.policy_version<>1 THEN RAISE EXCEPTION 'Invalid quote source or scope' USING ERRCODE='23514'; END IF;
 NEW.updated_at=now();
 ELSE
 IF OLD.provider_version IS NULL OR NOT (quote_vendor(OLD.id) OR quote_admin()) OR NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['status','version','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','updated_at']) OR NOT ((OLD.status='requested' AND NEW.status IN('assigned','contacted','closed')) OR (OLD.status='assigned' AND NEW.status IN('contacted','closed')) OR (OLD.status='contacted' AND NEW.status IN('quoted','closed')) OR (OLD.status='quoted' AND NEW.status='closed')) THEN RAISE EXCEPTION 'Invalid quote transition' USING ERRCODE='23514'; END IF;
 NEW.updated_at=now();
 END IF; RETURN NEW;
END $$;
