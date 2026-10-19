-- Manual property models use the existing scanned and independently reviewed media workflow.
ALTER TABLE media_assets DROP CONSTRAINT media_assets_purpose_check;
ALTER TABLE media_assets ADD CONSTRAINT media_assets_purpose_check CHECK(purpose IN ('photo','floor_plan','panorama','video','document','model_3d'));
ALTER TABLE listing_media DROP CONSTRAINT listing_media_kind_check;
ALTER TABLE listing_media ADD CONSTRAINT listing_media_kind_check CHECK(kind IN ('photo','video','floor_plan','panorama','model_3d'));
