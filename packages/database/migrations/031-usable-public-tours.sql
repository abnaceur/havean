-- A badge describes a published, scanned and decoded scene; provider uptime is
-- handled by the viewer's explicit fallback, not claimed by this read port.
CREATE OR REPLACE FUNCTION published_listing_has_tour(listing_uuid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM listings l JOIN listing_media m ON m.listing_id=l.id JOIN media_assets a ON a.id=m.asset_id
 WHERE l.id=listing_uuid AND l.status='published' AND (l.expires_at IS NULL OR l.expires_at>now())
 AND m.kind='panorama' AND m.status='approved' AND a.purpose='panorama'
 AND a.status='approved' AND a.visibility='public' AND a.scan_at IS NOT NULL
 AND coalesce(a.variants->>'display','')<>'' AND a.width>=1024 AND a.height>0
 AND abs(a.width::numeric/a.height-2)<=0.05)
$$;
