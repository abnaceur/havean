-- An owner grants an exact reserved first input before its agency can bind it.
-- Candidate documents belong to this owner; no agency receives ungranted files.
CREATE OR REPLACE FUNCTION digitization_model_source_permission_scope(engine_ref uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE workspace property_digitizations;input property_input_revisions;reserved boolean;revision_ref integer;sources_ref jsonb;
BEGIN
 SELECT * INTO workspace FROM property_digitizations WHERE id=engine_ref;
 IF workspace.id IS NULL OR workspace.state<>'active' OR workspace.target_type<>'listing' OR NOT digitization_actor_target(actor_id(),workspace.organization_id,workspace.created_by,workspace.target_type,workspace.target_id,workspace.unit_id) OR NOT EXISTS(SELECT 1 FROM listings WHERE id=workspace.listing_id AND owner_id=actor_id()) THEN RAISE EXCEPTION 'Current owner listing scope required' USING ERRCODE='42501';END IF;
 SELECT * INTO input FROM property_input_revisions WHERE digitization_id=workspace.id AND revision=workspace.current_input_revision;
 reserved=workspace.current_input_revision=0 AND EXISTS(SELECT 1 FROM digitization_input_slots WHERE digitization_id=workspace.id AND revision=1);
 IF reserved THEN
  revision_ref=1;
  SELECT coalesce(jsonb_agg(jsonb_build_object('assetId',a.id,'assetVersion',a.version,'mime',a.mime,'purpose','document') ORDER BY a.created_at DESC,a.id),'[]') INTO sources_ref FROM (SELECT id,version,mime,created_at FROM media_assets WHERE owner_id=actor_id() AND purpose='document' AND status='approved' AND scan_at IS NOT NULL AND visibility='private' ORDER BY created_at DESC,id LIMIT 100) a;
 ELSE
  IF input.id IS NULL OR (NOT EXISTS(SELECT 1 FROM jsonb_array_elements(input.source_set) source JOIN media_assets a ON a.id=(source->>'assetId')::uuid WHERE a.owner_id=actor_id() AND a.purpose='document' AND a.status='approved' AND a.scan_at IS NOT NULL AND a.visibility='private' AND a.version=(source->>'assetVersion')::integer) AND NOT EXISTS(SELECT 1 FROM digitization_evidence_grants WHERE digitization_id=workspace.id AND owner_id=actor_id())) THEN RAISE EXCEPTION 'Current owned private document source required' USING ERRCODE='42501';END IF;
  revision_ref=input.revision;
  SELECT coalesce(jsonb_agg(jsonb_build_object('assetId',a.id,'assetVersion',a.version,'mime',a.mime,'purpose',source->>'purpose') ORDER BY a.id),'[]') INTO sources_ref FROM jsonb_array_elements(input.source_set) source JOIN media_assets a ON a.id=(source->>'assetId')::uuid WHERE a.owner_id=actor_id() AND a.purpose='document' AND a.visibility='private' AND a.status='approved' AND a.scan_at IS NOT NULL AND a.version=(source->>'assetVersion')::integer;
 END IF;
 RETURN jsonb_build_object('digitizationId',workspace.id,'workspaceVersion',workspace.version,'inputRevision',revision_ref,'inputState',CASE WHEN reserved THEN 'reserved' ELSE 'current' END,
 'sources',sources_ref,
 'recipients',coalesce((SELECT jsonb_agg(jsonb_build_object('id',candidate.id,'name',candidate.display_name) ORDER BY candidate.display_name,candidate.id) FROM (SELECT DISTINCT p.id,p.display_name FROM profiles p JOIN memberships m ON m.user_id=p.id WHERE p.state='active' AND m.organization_id=workspace.organization_id AND m.status='active' AND m.role IN('agent','agency_manager') AND digitization_actor_target(p.id,workspace.organization_id,workspace.created_by,workspace.target_type,workspace.target_id,workspace.unit_id) ORDER BY p.id LIMIT 100) candidate),'[]'),
 'grants',coalesce((SELECT jsonb_agg(jsonb_build_object('id',g.id,'assetId',g.asset_id,'granteeId',g.grantee_id,'version',g.version,'purposes',g.purposes,'state',g.state,'expiresAt',g.expires_at) ORDER BY g.created_at DESC,g.id) FROM (SELECT * FROM digitization_evidence_grants WHERE digitization_id=workspace.id AND owner_id=actor_id() ORDER BY created_at DESC,id LIMIT 1000) g),'[]'));
END $$;
REVOKE ALL ON FUNCTION digitization_model_source_permission_scope(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION digitization_model_source_permission_scope(uuid) TO haven_app;

