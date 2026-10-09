-- A non-owner REVOKE can emit only a warning. Refuse a false successful migration.
-- Before upgrades, the database administrator must execute migration 164 using
-- the extension-owner connection. Application and migration secrets remain separate.
DO $verification$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'st_fromflatgeobuf%'
      AND has_function_privilege('haven_app',p.oid,'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'RUNTIME_GEOMETRY_DECODER_PERMISSION_UNSAFE: database extension owner must execute 164-deny-unused-flatgeobuf-decoders-to-runtime.sql before retrying this forward migration';
  END IF;
END
$verification$;
