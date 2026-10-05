-- Decoder approval alone does not grant anonymous publication rights.
DROP POLICY approved_media_read ON media_assets;
CREATE POLICY approved_media_read ON media_assets FOR SELECT USING(
 visibility='public' AND status='approved' AND (
  id IN(SELECT asset_id FROM listing_media WHERE status='approved' AND (listing_id IN(SELECT id FROM public_listings) OR development_id IN(SELECT id FROM developments WHERE status IN ('coming_soon','on_sale','sold_out'))))
  OR '/api/v1/media/'||id::text||'/view'=ANY(ARRAY(SELECT unnest(photos) FROM public_listings))
 )
);
