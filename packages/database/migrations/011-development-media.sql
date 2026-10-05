ALTER TABLE developments ENABLE ROW LEVEL SECURITY;
CREATE POLICY development_public ON developments FOR SELECT USING(status IN ('coming_soon','on_sale','sold_out'));
CREATE POLICY development_scope ON developments USING(organization_id=org_id() OR staff_scope() OR review_scope()) WITH CHECK(organization_id=org_id() OR staff_scope() OR review_scope());
ALTER TABLE floor_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY plan_read ON floor_plans FOR SELECT USING(development_id IN(SELECT id FROM developments));
CREATE POLICY plan_write ON floor_plans USING(development_id IN(SELECT id FROM developments WHERE organization_id=org_id() OR staff_scope() OR review_scope())) WITH CHECK(development_id IN(SELECT id FROM developments WHERE organization_id=org_id() OR staff_scope() OR review_scope()));
-- Existing photo fixtures are not floor-plan drawings.
UPDATE floor_plans SET photo=NULL WHERE photo LIKE '/homes/%';
ALTER TABLE listing_media ALTER COLUMN listing_id DROP NOT NULL;
ALTER TABLE listing_media ADD COLUMN development_id uuid REFERENCES developments ON DELETE CASCADE;
ALTER TABLE listing_media ADD COLUMN floor_plan_id uuid REFERENCES floor_plans ON DELETE CASCADE;
ALTER TABLE listing_media ADD CONSTRAINT exactly_one_media_parent CHECK(num_nonnulls(listing_id,development_id)=1);
ALTER TABLE listing_media ADD CONSTRAINT plan_media_parent CHECK(floor_plan_id IS NULL OR (development_id IS NOT NULL AND kind='floor_plan'));
CREATE UNIQUE INDEX development_media_asset ON listing_media(development_id,asset_id);
DROP POLICY listing_media_scope ON listing_media;
DROP POLICY listing_media_public ON listing_media;
DROP POLICY agent_media_assignment ON listing_media;
CREATE POLICY listing_media_scope ON listing_media USING(
 staff_scope() OR review_scope() OR listing_id IN(SELECT id FROM listings WHERE organization_id=org_id() OR owner_id=actor_id()) OR development_id IN(SELECT id FROM developments WHERE organization_id=org_id())
) WITH CHECK(staff_scope() OR review_scope() OR listing_id IN(SELECT id FROM listings WHERE organization_id=org_id() OR owner_id=actor_id()) OR development_id IN(SELECT id FROM developments WHERE organization_id=org_id()));
CREATE POLICY listing_media_public ON listing_media FOR SELECT USING(status='approved' AND (listing_id IN(SELECT id FROM public_listings) OR development_id IN(SELECT id FROM developments WHERE status IN ('coming_soon','on_sale','sold_out'))));
CREATE POLICY agent_media_assignment ON listing_media AS RESTRICTIVE FOR SELECT USING(NOT agent_only() OR (status='approved' AND (listing_id IN(SELECT id FROM public_listings) OR development_id IN(SELECT id FROM developments WHERE status IN ('coming_soon','on_sale','sold_out')))) OR listing_id IN(SELECT id FROM listings WHERE agent_id IN(SELECT id FROM agents WHERE user_id=actor_id()) OR owner_id=actor_id()));

CREATE POLICY agent_media_insert ON listing_media AS RESTRICTIVE FOR INSERT WITH CHECK(NOT agent_only() OR listing_id IN(SELECT id FROM listings WHERE agent_id IN(SELECT id FROM agents WHERE user_id=actor_id()) OR owner_id=actor_id()));
CREATE POLICY agent_media_update ON listing_media AS RESTRICTIVE FOR UPDATE USING(NOT agent_only() OR listing_id IN(SELECT id FROM listings WHERE agent_id IN(SELECT id FROM agents WHERE user_id=actor_id()) OR owner_id=actor_id()));
CREATE POLICY agent_media_delete ON listing_media AS RESTRICTIVE FOR DELETE USING(NOT agent_only() OR listing_id IN(SELECT id FROM listings WHERE agent_id IN(SELECT id FROM agents WHERE user_id=actor_id()) OR owner_id=actor_id()));
