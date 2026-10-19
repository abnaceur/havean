-- Serialize a new cross-tenant binding with tenant source erasure. The current
-- scanned source is checked after acquiring its lock, before the binding exists.
CREATE FUNCTION digitization_binding_source_lock() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE source media_assets;
BEGIN
 SELECT * INTO source FROM media_assets WHERE id=NEW.asset_id FOR SHARE;
 IF source.id IS NULL OR source.version<>NEW.asset_version OR source.status<>'approved' OR source.scan_at IS NULL THEN RAISE EXCEPTION 'Current scanned source required before binding' USING ERRCODE='40001';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER binding_source_deletion_lock BEFORE INSERT ON digitization_asset_bindings FOR EACH ROW EXECUTE FUNCTION digitization_binding_source_lock();
REVOKE ALL ON FUNCTION digitization_binding_source_lock() FROM PUBLIC,haven_app;
