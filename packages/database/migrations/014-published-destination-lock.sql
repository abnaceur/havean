-- Consumer inquiries/bookings lock only a published destination. This narrow
-- function avoids giving consumers UPDATE permission merely to take a read lock.
CREATE FUNCTION published_listing_destination(listing_uuid uuid)
RETURNS TABLE(organization_id uuid,agent_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT l.organization_id,l.agent_id FROM listings l WHERE l.id=listing_uuid AND l.status='published' FOR SHARE
$$;
REVOKE ALL ON FUNCTION published_listing_destination(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION published_listing_destination(uuid) TO haven_app;
