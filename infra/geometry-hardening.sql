-- The marketplace uses bounded canonical geometry/GeoJSON, never FlatGeobuf uploads.
-- CVE-2026-73515 has no vendor fixed package at this verification date.
-- Remove the unused decoder attack surface from the unprivileged runtime role;
-- the separate trusted extension owner/migration role retains maintenance ability.
DO $hardening$
DECLARE decoder record;
BEGIN
  FOR decoder IN
    SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS arguments
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'st_fromflatgeobuf%'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC',decoder.nspname,decoder.proname,decoder.arguments);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM haven_app',decoder.nspname,decoder.proname,decoder.arguments);
  END LOOP;
END
$hardening$;

-- Keep trusted migration maintenance separate from runtime access. PostgreSQL
-- requires an owner or grant option even for an already-satisfied REVOKE.
DO $maintenance$
DECLARE decoder record;
BEGIN
  FOR decoder IN
    SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS arguments
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'st_fromflatgeobuf%'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO haven_migrate WITH GRANT OPTION',decoder.nspname,decoder.proname,decoder.arguments);
  END LOOP;
END
$maintenance$;
