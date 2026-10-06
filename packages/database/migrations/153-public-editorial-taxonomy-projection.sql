-- Public read port exposes only active safe category labels, never editor identity.
CREATE FUNCTION public_home_taxonomy(market text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT coalesce(jsonb_agg(jsonb_build_object('category',t.category,'label',t.label,'version',t.version) ORDER BY t.category),'[]') FROM home_taxonomy t JOIN cities ci ON ci.slug=t.city AND ci.status='active' WHERE t.city=market AND t.active $$;
REVOKE ALL ON FUNCTION public_home_taxonomy(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_home_taxonomy(text) TO haven_app;
