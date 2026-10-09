-- Grant owners may confirm a scoped revision exists without reading other private
-- captures or the immutable source-set contents in that revision.
CREATE FUNCTION digitization_grant_revision_exists(engine uuid,revision_ref int) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT digitization_target_access(engine) AND EXISTS(SELECT 1 FROM property_input_revisions r WHERE r.digitization_id=engine AND r.revision=revision_ref)
$$;
