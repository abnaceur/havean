ALTER TABLE media_assets ADD COLUMN purpose text NOT NULL DEFAULT 'photo' CHECK(purpose IN ('photo','floor_plan','panorama','video','document'));
ALTER TABLE media_assets ADD COLUMN duration numeric(8,3);
ALTER TABLE media_assets ADD COLUMN scan_at timestamptz;
DROP POLICY media_scope ON media_assets;
CREATE POLICY owned_media ON media_assets USING(owner_id=actor_id() OR staff_scope()) WITH CHECK(owner_id=actor_id() OR staff_scope());
CREATE POLICY approved_media_read ON media_assets FOR SELECT USING(visibility='public' AND status='approved');
CREATE TABLE listing_media(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 listing_id uuid NOT NULL REFERENCES listings ON DELETE CASCADE,
 asset_id uuid NOT NULL REFERENCES media_assets,
 kind text NOT NULL CHECK(kind IN ('photo','video','floor_plan','panorama')),
 title text NOT NULL CHECK(length(title) BETWEEN 2 AND 120),
 position integer NOT NULL DEFAULT 0 CHECK(position BETWEEN 0 AND 1000),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','rejected')),
 metadata jsonb NOT NULL DEFAULT '{}',version integer NOT NULL DEFAULT 1,
 submitted_by uuid NOT NULL REFERENCES profiles,
 review_reason text,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(listing_id,asset_id)
);
ALTER TABLE listing_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY listing_media_scope ON listing_media USING(
 staff_scope() OR review_scope() OR listing_id IN(SELECT id FROM listings WHERE organization_id=org_id() OR owner_id=actor_id())
) WITH CHECK(staff_scope() OR review_scope() OR listing_id IN(SELECT id FROM listings WHERE organization_id=org_id() OR owner_id=actor_id()));
CREATE POLICY listing_media_public ON listing_media FOR SELECT USING(status='approved' AND listing_id IN(SELECT id FROM public_listings));
CREATE POLICY agent_media_assignment ON listing_media AS RESTRICTIVE FOR ALL USING(
 NOT agent_only() OR listing_id IN(SELECT id FROM listings WHERE agent_id IN(SELECT id FROM agents WHERE user_id=actor_id()) OR owner_id=actor_id())
);
