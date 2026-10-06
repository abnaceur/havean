-- An append-only committed revision count changes even when transactions commit
-- out of sequence. No global writer lock is added to property/finance workflows.
CREATE TABLE public_read_revisions(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,source text NOT NULL);
ALTER TABLE public_read_revisions ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION record_public_read_revision() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN INSERT INTO public_read_revisions(source) VALUES(TG_TABLE_NAME); RETURN NULL; END $$;
REVOKE ALL ON FUNCTION record_public_read_revision() FROM PUBLIC;
CREATE FUNCTION immutable_public_read_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Public read revisions are append-only' USING ERRCODE='42501'; END $$;
CREATE TRIGGER immutable_public_read_revision BEFORE UPDATE OR DELETE ON public_read_revisions FOR EACH ROW EXECUTE FUNCTION immutable_public_read_revision();
CREATE TRIGGER no_public_read_revision_reset BEFORE TRUNCATE ON public_read_revisions FOR EACH STATEMENT EXECUTE FUNCTION immutable_public_read_revision();
DO $$ DECLARE target text; BEGIN
 FOREACH target IN ARRAY ARRAY['listings','units','communities','districts','cities','buildings','neighborhoods','transit_lines','transit_stations','rental_terms','leases','commercial_details','listing_media','media_assets','agents','profiles','memberships','market_config','curated_boosts','listing_view_events'] LOOP
  EXECUTE format('CREATE TRIGGER public_read_changed AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH STATEMENT EXECUTE FUNCTION record_public_read_revision()',target);
 END LOOP;
END $$;
-- Only scalar revision/deadline metadata crosses this internal read port; no
-- actor, editorial record, private contact or source row is returned.
CREATE FUNCTION public_read_cache_stamp() RETURNS TABLE(revision text,instant timestamptz,deadline timestamptz) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT (SELECT count(*)::text FROM public_read_revisions),now(),least(
  ((date_trunc('day',now() AT TIME ZONE 'UTC')+INTERVAL '1 day') AT TIME ZONE 'UTC'),
  (SELECT min(expires_at) FROM listings WHERE status='published' AND expires_at>now()),
  (SELECT min(starts_at) FROM curated_boosts WHERE status='active' AND starts_at>now()),
  (SELECT min(ends_at) FROM curated_boosts WHERE status='active' AND ends_at>now()))
$$;
REVOKE ALL ON FUNCTION public_read_cache_stamp() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_read_cache_stamp() TO haven_app;
CREATE INDEX listings_newest_public ON listings(transaction,published_at DESC NULLS LAST,id) WHERE status='published';
CREATE INDEX listings_newest_all_public ON listings(published_at DESC NULLS LAST,id) WHERE status='published';
-- Public money remains decimal text. Match its exact SQL numeric sort expression.
CREATE INDEX listings_price_text_public ON listings(transaction,((price::text)::numeric),id) WHERE status='published';
