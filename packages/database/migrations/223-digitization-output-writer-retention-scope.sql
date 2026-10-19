-- Collector leases are engine lineage, not an owning-module retention claim.
CREATE OR REPLACE FUNCTION digitization_asset_has_retained_reference(asset_ref uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ref record;found_ref boolean;
BEGIN
 FOR ref IN SELECT n.nspname schema_name,t.relname table_name,a.attname column_name FROM pg_constraint fk JOIN pg_class t ON t.oid=fk.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace JOIN LATERAL unnest(fk.conkey,fk.confkey) keys(local_key,foreign_key) ON true JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=keys.local_key JOIN pg_attribute target ON target.attrelid=fk.confrelid AND target.attnum=keys.foreign_key
 WHERE fk.contype='f' AND fk.confrelid='media_assets'::regclass AND target.attname='id' AND t.relname NOT IN('digitization_asset_bindings','digitization_evidence_grants','digitization_capture_uploads','digitization_output_writes') LOOP
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.%I WHERE %I=$1)',ref.schema_name,ref.table_name,ref.column_name) INTO found_ref USING asset_ref;
  IF found_ref THEN RETURN true;END IF;
 END LOOP;RETURN false;
END $$;
