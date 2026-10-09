-- Keep the exact revision, expiry, curation and UTC-day semantics of SQL 161.
-- PL/pgSQL retains its parameter-free query plan between calls; the SQL-language
-- security-definer body otherwise replans the same metadata query on every read.
-- No revision or deadline value is cached: every call reads committed metadata.
CREATE OR REPLACE FUNCTION public_read_cache_stamp()
RETURNS TABLE(revision text,instant timestamptz,deadline timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 RETURN QUERY SELECT (SELECT count(*)::text FROM public_read_revisions),now(),least(
  ((date_trunc('day',now() AT TIME ZONE 'UTC')+INTERVAL '1 day') AT TIME ZONE 'UTC'),
  (SELECT min(expires_at) FROM listings WHERE status='published' AND expires_at>now()),
  (SELECT min(starts_at) FROM curated_boosts WHERE status='active' AND starts_at>now()),
  (SELECT min(ends_at) FROM curated_boosts WHERE status='active' AND ends_at>now()));
END $$;
REVOKE ALL ON FUNCTION public_read_cache_stamp() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_read_cache_stamp() TO haven_app;
