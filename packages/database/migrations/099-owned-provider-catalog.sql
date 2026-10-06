ALTER TABLE providers ALTER COLUMN status SET DEFAULT 'draft';
ALTER TABLE providers ADD COLUMN owner_id uuid REFERENCES profiles,ADD COLUMN city text REFERENCES cities(slug),ADD COLUMN district_ids uuid[] NOT NULL DEFAULT '{}',ADD COLUMN provenance text NOT NULL DEFAULT 'historical_unknown',ADD COLUMN reviewed_by uuid REFERENCES profiles,ADD COLUMN reviewed_at timestamptz,ADD COLUMN review_note text;
-- These exact IDs are the supplied synthetic Beijing fixture, not verified businesses.
UPDATE providers SET city='bj',provenance='synthetic_seed',district_ids=ARRAY(SELECT d.id FROM districts d JOIN cities ci ON ci.id=d.city_id WHERE ci.slug='bj' AND d.name=ANY(providers.districts)) WHERE id IN('10000000-0000-4000-8000-000000004000','10000000-0000-4000-8000-000000004001','10000000-0000-4000-8000-000000004002');
ALTER TABLE providers ADD CONSTRAINT provider_workflow_state CHECK(status IN('draft','submitted','approved','rejected','revoked'));
CREATE FUNCTION provider_reviewer() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM profiles p JOIN memberships m ON m.user_id=p.id WHERE p.id=actor_id() AND p.state='active' AND m.status='active' AND m.role IN('admin','moderator')) $$;
CREATE FUNCTION provider_owned(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM providers v JOIN profiles p ON p.id=v.owner_id JOIN memberships m ON m.user_id=p.id AND m.organization_id=v.organization_id JOIN organizations o ON o.id=m.organization_id AND o.type='vendor' WHERE v.id=target AND v.owner_id=actor_id() AND v.organization_id=org_id() AND p.state='active' AND m.status='active' AND m.role='vendor') $$;
REVOKE ALL ON FUNCTION provider_reviewer(),provider_owned(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION provider_reviewer(),provider_owned(uuid) TO haven_app;
ALTER TABLE providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY provider_read ON providers FOR SELECT USING(provider_owned(id) OR provider_reviewer());
CREATE POLICY provider_insert ON providers FOR INSERT WITH CHECK(staff_scope() OR owner_id=actor_id() AND organization_id=org_id() AND status='draft' AND EXISTS(SELECT 1 FROM memberships m JOIN profiles p ON p.id=m.user_id WHERE p.id=actor_id() AND p.state='active' AND m.organization_id=org_id() AND m.status='active' AND m.role='vendor'));
CREATE POLICY provider_update ON providers FOR UPDATE USING(provider_owned(id) OR provider_reviewer()) WITH CHECK(provider_owned(id) OR provider_reviewer());
CREATE POLICY provider_retention ON providers FOR DELETE USING(staff_scope());
CREATE TABLE provider_portfolio(provider_id uuid NOT NULL REFERENCES providers ON DELETE CASCADE,asset_id uuid NOT NULL REFERENCES media_assets,asset_version int NOT NULL CHECK(asset_version>0),position int NOT NULL CHECK(position BETWEEN 0 AND 11),alt text NOT NULL CHECK(length(alt) BETWEEN 3 AND 160),caption text NOT NULL CHECK(length(caption)<=300),rights text NOT NULL CHECK(length(rights) BETWEEN 5 AND 300),PRIMARY KEY(provider_id,asset_id),UNIQUE(provider_id,position));
ALTER TABLE provider_portfolio ENABLE ROW LEVEL SECURITY;
CREATE POLICY provider_portfolio_read ON provider_portfolio FOR SELECT USING(provider_owned(provider_id) OR provider_reviewer());
CREATE POLICY provider_portfolio_write ON provider_portfolio FOR ALL USING(provider_owned(provider_id) OR staff_scope()) WITH CHECK(provider_owned(provider_id) OR staff_scope());
GRANT SELECT,INSERT,UPDATE,DELETE ON providers,provider_portfolio TO haven_app;
CREATE VIEW public_providers AS SELECT p.id,p.slug,p.name,p.description,p.categories,p.districts,p.city,p.version,
 CASE WHEN p.owner_id IS NULL AND p.provenance='synthetic_seed' THEN p.photos ELSE ARRAY(SELECT '/api/v1/media/'||pm.asset_id||'/view' FROM provider_portfolio pm JOIN media_assets a ON a.id=pm.asset_id WHERE pm.provider_id=p.id AND a.owner_id=p.owner_id AND a.version=pm.asset_version AND a.visibility='public' AND a.status='approved' AND a.scan_at IS NOT NULL AND a.purpose='photo' ORDER BY pm.position) END photos,
 coalesce((SELECT jsonb_agg(jsonb_build_object('url','/api/v1/media/'||pm.asset_id||'/view','alt',pm.alt,'caption',pm.caption) ORDER BY pm.position) FROM provider_portfolio pm JOIN media_assets a ON a.id=pm.asset_id WHERE pm.provider_id=p.id AND a.owner_id=p.owner_id AND a.version=pm.asset_version AND a.visibility='public' AND a.status='approved' AND a.scan_at IS NOT NULL AND a.purpose='photo'),'[]') portfolio
 FROM providers p WHERE p.status='approved' AND EXISTS(SELECT 1 FROM cities ci WHERE ci.slug=p.city AND ci.status='active') AND (p.owner_id IS NULL AND p.provenance='synthetic_seed' OR EXISTS(SELECT 1 FROM profiles pr JOIN memberships m ON m.user_id=pr.id AND m.organization_id=p.organization_id WHERE pr.id=p.owner_id AND pr.state='active' AND m.status='active' AND m.role='vendor'));
GRANT SELECT ON public_providers TO haven_app;
CREATE FUNCTION provider_asset_public(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM provider_portfolio pm JOIN public_providers p ON p.id=pm.provider_id JOIN media_assets a ON a.id=pm.asset_id WHERE pm.asset_id=target AND a.visibility='public' AND a.status='approved' AND a.scan_at IS NOT NULL AND a.version=pm.asset_version) $$;
REVOKE ALL ON FUNCTION provider_asset_public(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION provider_asset_public(uuid) TO haven_app;
CREATE POLICY provider_media_public ON media_assets FOR SELECT USING(provider_asset_public(id));
CREATE FUNCTION published_provider_destination(target uuid) RETURNS TABLE(organization_id uuid,version int,city text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE source providers%ROWTYPE;
BEGIN
 SELECT v.* INTO source FROM providers v JOIN public_providers p ON p.id=v.id WHERE v.id=target FOR SHARE OF v;
 IF NOT FOUND THEN RETURN;END IF;
 IF source.owner_id IS NOT NULL THEN PERFORM 1 FROM profiles p JOIN memberships m ON m.user_id=p.id AND m.organization_id=source.organization_id WHERE p.id=source.owner_id AND p.state='active' AND m.status='active' AND m.role='vendor' FOR SHARE OF p,m;IF NOT FOUND THEN RETURN;END IF;END IF;
 RETURN QUERY SELECT source.organization_id,source.version,source.city;
END $$;
REVOKE ALL ON FUNCTION published_provider_destination(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION published_provider_destination(uuid) TO haven_app;

-- Preserve native authority; the guest addition still requires its own INSERT policy.
DROP POLICY lead_destination ON leads;
CREATE POLICY lead_destination ON leads AS RESTRICTIVE FOR INSERT WITH CHECK(
 organization_id=org_id() OR staff_scope() OR
 (user_id=actor_id() AND (
  (resource_type='listing' AND EXISTS(SELECT 1 FROM listings WHERE id=resource_id AND listings.organization_id=leads.organization_id AND status='published')) OR
  (resource_type='development' AND EXISTS(SELECT 1 FROM developments WHERE id=resource_id AND developments.organization_id=leads.organization_id AND status IN ('on_sale','coming_soon'))) OR
  (resource_type='agent' AND EXISTS(SELECT 1 FROM agents WHERE id=resource_id AND agents.organization_id=leads.organization_id)) OR
  (resource_type='provider' AND EXISTS(SELECT 1 FROM published_provider_destination(resource_id) p WHERE p.organization_id=leads.organization_id))
 )) OR (user_id IS NULL AND guest_session_id=inquiry_guest_actor() AND guest_inquiry_destination_valid(resource_type,resource_id,organization_id,agent_id,resource_version,inquiry_city,floor_plan_id,floor_plan_version,inquiry_intent))
);

CREATE OR REPLACE FUNCTION guest_inquiry_destination_valid(kind text,resource uuid,organization uuid,agent uuid,resource_version int,city_slug text,type_id uuid,type_version int,intent text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF kind='listing' THEN RETURN EXISTS(SELECT 1 FROM published_listing_destination(resource) destination JOIN public_listings p ON p.id=resource WHERE destination.organization_id=organization AND p.version=resource_version AND ((agent IS NULL AND NOT EXISTS(SELECT 1 FROM public_listing_agents(resource))) OR EXISTS(SELECT 1 FROM public_listing_agents(resource) eligible WHERE eligible.id=agent)));
 ELSIF kind='development' THEN RETURN agent IS NULL AND EXISTS(SELECT 1 FROM published_development_destination(resource,type_id) destination WHERE destination.organization_id=organization AND destination.version=resource_version AND destination.floor_plan_version IS NOT DISTINCT FROM type_version AND (intent<>'available_unit' OR destination.status='on_sale' AND destination.available>0));
 ELSIF kind='provider' THEN RETURN agent IS NULL AND EXISTS(SELECT 1 FROM published_provider_destination(resource) p WHERE p.organization_id=organization AND p.version=resource_version AND p.city=city_slug);
 ELSIF kind='agent' THEN RETURN agent=resource AND EXISTS(SELECT 1 FROM agents a JOIN profiles p ON p.id=a.user_id AND p.state='active' JOIN cities ci ON ci.slug=city_slug AND ci.status='active' WHERE a.id=resource AND a.organization_id=organization AND a.version=resource_version AND a.verified_until>=(now() AT TIME ZONE ci.timezone)::date AND (a.city IS NULL OR a.city=ci.slug) AND EXISTS(SELECT 1 FROM districts d WHERE d.city_id=ci.id AND d.status='active' AND d.name=ANY(a.districts)) AND EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=a.user_id AND m.organization_id=organization AND m.status='active' AND m.role IN('agent','agency_manager')));
 END IF;RETURN false;
END $$;

CREATE FUNCTION personal_provider_export() RETURNS TABLE(profile jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('id',p.id,'name',p.name,'description',p.description,'city',p.city,'categories',p.categories,'districtIds',p.district_ids,'status',p.status,'version',p.version,'reviewNote',p.review_note,'provenance',p.provenance,'portfolio',coalesce((SELECT jsonb_agg(jsonb_build_object('assetId',pm.asset_id,'version',pm.asset_version,'alt',pm.alt,'caption',pm.caption,'rights',pm.rights) ORDER BY pm.position) FROM provider_portfolio pm WHERE pm.provider_id=p.id),'[]')) FROM providers p WHERE p.owner_id=actor_id()
$$;
REVOKE ALL ON FUNCTION personal_provider_export() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION personal_provider_export() TO haven_app;
