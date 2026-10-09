-- INSERT RETURNING must evaluate the candidate input row, not a lookup of itself.
CREATE FUNCTION digitization_revision_bindings_access(engine uuid,revision_ref int,access_purpose text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT digitization_target_access(engine) AND NOT EXISTS(SELECT 1 FROM digitization_asset_bindings b
 WHERE b.digitization_id=engine AND b.input_revision=revision_ref
 AND NOT coalesce(digitization_asset_access(engine,b.asset_id,b.asset_version,revision_ref,access_purpose),false))
$$;
CREATE OR REPLACE FUNCTION digitization_revision_access(engine uuid,revision_ref int,access_purpose text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM property_input_revisions r WHERE r.digitization_id=engine AND r.revision=revision_ref
 AND digitization_sources_access(engine,revision_ref,r.source_set,access_purpose)
 AND digitization_revision_bindings_access(engine,revision_ref,access_purpose))
$$;
DROP POLICY engine_read ON property_input_revisions;
CREATE POLICY engine_read ON property_input_revisions FOR SELECT USING(
 (digitization_sources_access(digitization_id,revision,source_set,'preview') AND digitization_revision_bindings_access(digitization_id,revision,'preview')) OR
 (digitization_sources_access(digitization_id,revision,source_set,'document_processing') AND digitization_revision_bindings_access(digitization_id,revision,'document_processing')));

-- Purpose-scoped internal descriptor; do not broaden legacy media SELECT policy.
CREATE FUNCTION digitization_source_descriptor(engine uuid,asset uuid,asset_rev int,revision_ref int) RETURNS TABLE(object_key text,mime text,size bigint,visibility text,purpose text,version int)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT a.object_key,a.mime,a.size,a.visibility,a.purpose,a.version FROM media_assets a
 WHERE a.id=asset AND a.version=asset_rev AND digitization_asset_access(engine,asset,asset_rev,revision_ref,'document_processing') FOR SHARE OF a
$$;
