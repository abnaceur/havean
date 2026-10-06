-- Public complaint context must lock the published source without admitting
-- consumer UPDATE privileges on listings.
CREATE FUNCTION support_listing_source(target uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r record;
BEGIN
 PERFORM 1 FROM profiles WHERE id=actor_id() AND state='active' FOR SHARE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT l.id,l.version,l.title,l.slug,l.transaction,l.segment,ci.slug AS city INTO r FROM listings l JOIN units u ON u.id=l.unit_id JOIN communities co ON co.id=u.community_id JOIN districts d ON d.id=co.district_id JOIN cities ci ON ci.id=d.city_id WHERE l.id=target AND l.status='published' AND ci.status='active' AND d.status='active' AND co.status='active' FOR SHARE OF l;
 IF NOT FOUND THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('id',r.id,'version',r.version,'title',r.title,'url','/'||r.city||'/'||CASE WHEN r.segment='commercial' THEN 'commercial' WHEN r.transaction='rent' THEN 'rent' ELSE 'buy' END||'/'||r.slug);
END $$;
REVOKE ALL ON FUNCTION support_listing_source(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION support_listing_source(uuid) TO haven_app;
