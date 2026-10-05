ALTER TABLE favorites ADD COLUMN saved boolean NOT NULL DEFAULT true;
ALTER TABLE favorites ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0);
-- Keep removed rows as versioned tombstones so stale toggles cannot recreate them.
CREATE POLICY favorite_available ON favorites AS RESTRICTIVE FOR INSERT
 WITH CHECK(NOT saved OR EXISTS(SELECT 1 FROM public_listings WHERE id=listing_id));
CREATE POLICY favorite_still_available ON favorites AS RESTRICTIVE FOR UPDATE
 WITH CHECK(NOT saved OR EXISTS(SELECT 1 FROM public_listings WHERE id=listing_id));
