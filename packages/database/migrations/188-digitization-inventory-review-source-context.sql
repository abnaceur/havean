-- Private service-only preflight context for independent inventory review.
-- This does not grant the reviewer an evidence preview or expose source bytes.
CREATE FUNCTION digitization_inventory_review_sources(revision_ref uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE application digitization_inventory_applications;result jsonb;
BEGIN
 IF digitization_inventory_review_unit_lock(revision_ref) IS NULL OR NOT digitization_inventory_application_current(revision_ref) THEN RAISE EXCEPTION 'Current independent inventory review required' USING ERRCODE='42501';END IF;
 SELECT * INTO application FROM digitization_inventory_applications WHERE revision_id=revision_ref;
 SELECT jsonb_build_object('engineId',application.digitization_id,'inputRevision',application.input_revision,'author',jsonb_build_object('id',application.created_by,'orgId',application.organization_id,'roles',(SELECT jsonb_agg(DISTINCT role) FROM memberships WHERE user_id=application.created_by AND organization_id=application.organization_id AND status='active' AND role IN('agent','agency_manager'))),'sources',inputs.source_set) INTO result FROM property_input_revisions inputs WHERE inputs.digitization_id=application.digitization_id AND inputs.revision=application.input_revision;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION digitization_inventory_review_sources(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION digitization_inventory_review_sources(uuid) TO haven_app;
