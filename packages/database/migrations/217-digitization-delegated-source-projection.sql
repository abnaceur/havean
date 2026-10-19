-- A granted source remains absent from generic media/profile reads. This narrow
-- projection requires the current agency recipient and exact source permission.
CREATE FUNCTION digitization_delegated_source_scope(engine_ref uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE workspace property_digitizations;revision_ref integer;sources_ref jsonb;
BEGIN
 SELECT * INTO workspace FROM property_digitizations WHERE id=engine_ref;
 IF workspace.id IS NULL OR workspace.target_type<>'listing' OR workspace.state<>'active' OR workspace.organization_id IS DISTINCT FROM org_id() OR NOT digitization_private_access(workspace.id) OR NOT EXISTS(SELECT 1 FROM profiles p JOIN memberships m ON m.user_id=p.id JOIN organizations o ON o.id=m.organization_id WHERE p.id=actor_id() AND p.state='active' AND m.organization_id=workspace.organization_id AND m.status='active' AND m.role IN('agent','agency_manager') AND o.type='agency') THEN RAISE EXCEPTION 'Current assigned agency source scope required' USING ERRCODE='42501';END IF;
 revision_ref=workspace.current_input_revision+1;
 SELECT coalesce(jsonb_agg(jsonb_build_object('assetId',source.id,'assetVersion',source.version,'mime',source.mime,'bytes',source.size::text) ORDER BY source.id),'[]') INTO sources_ref FROM (SELECT DISTINCT asset.id,asset.version,asset.mime,asset.size FROM digitization_evidence_grants g JOIN media_assets asset ON asset.id=g.asset_id JOIN profiles owner ON owner.id=g.owner_id JOIN digitization_input_slots slot ON slot.digitization_id=g.digitization_id AND slot.revision=g.input_revision WHERE g.digitization_id=workspace.id AND g.input_revision=revision_ref AND g.grantee_id=actor_id() AND g.state='active' AND g.expires_at>statement_timestamp() AND ARRAY['preview','document_processing']::text[]<@g.purposes AND asset.owner_id=g.owner_id AND asset.version=g.asset_version AND asset.visibility='private' AND asset.status='approved' AND asset.scan_at IS NOT NULL AND asset.purpose='document' AND owner.state='active' AND digitization_actor_target(g.owner_id,workspace.organization_id,workspace.created_by,workspace.target_type,workspace.target_id,workspace.unit_id) ORDER BY asset.id LIMIT 100) source;
 RETURN jsonb_build_object('workspaceVersion',workspace.version,'inputRevision',revision_ref,'listingId',workspace.listing_id,'sources',sources_ref);
END $$;
REVOKE ALL ON FUNCTION digitization_delegated_source_scope(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION digitization_delegated_source_scope(uuid) TO haven_app;
