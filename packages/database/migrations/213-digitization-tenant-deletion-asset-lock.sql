-- Qualify source locking independently of the deletion loop record.
CREATE OR REPLACE FUNCTION digitization_request_tenant_deletion(organization_ref uuid,scope_ref text,confirmed boolean,reason_ref text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE context jsonb;request digitization_tenant_deletions;r processing_runs;a media_assets;retained boolean;
BEGIN
 IF NOT platform_admin_lock() THEN RAISE EXCEPTION 'Current platform administrator required' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM organizations WHERE id=organization_ref FOR UPDATE;
 PERFORM 1 FROM property_digitizations WHERE organization_id=organization_ref ORDER BY id FOR UPDATE;
 PERFORM 1 FROM processing_runs WHERE organization_id=organization_ref ORDER BY id FOR UPDATE;
 PERFORM 1 FROM processing_stages WHERE organization_id=organization_ref ORDER BY id FOR UPDATE;
 PERFORM 1 FROM artifacts WHERE organization_id=organization_ref ORDER BY id FOR SHARE;
 PERFORM 1 FROM digitization_capture_uploads WHERE organization_id=organization_ref ORDER BY id FOR UPDATE;
 PERFORM 1 FROM media_assets locked_asset WHERE EXISTS(SELECT 1 FROM digitization_asset_bindings b WHERE b.asset_id=locked_asset.id AND b.organization_id=organization_ref) ORDER BY locked_asset.id FOR UPDATE;
 context:=digitization_tenant_deletion_context(organization_ref);
 IF confirmed IS DISTINCT FROM true OR reason_ref IS NULL OR length(trim(reason_ref)) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'Explicit tenant deletion and reason required' USING ERRCODE='23514';END IF;
 IF context->'request'<>'null'::jsonb OR context->>'scopeVersion' IS DISTINCT FROM scope_ref THEN RAISE EXCEPTION 'Current unrequested tenant scope required' USING ERRCODE='40001';END IF;
 INSERT INTO digitization_tenant_deletions(organization_id,created_by,scope_version,reason,deletion_confirmed) VALUES(organization_ref,actor_id(),scope_ref,trim(reason_ref),true) RETURNING * INTO request;
 FOR r IN SELECT * FROM processing_runs WHERE organization_id=organization_ref ORDER BY id LOOP
  IF r.state NOT IN('ready','cancelled','cancel_requested') THEN UPDATE processing_runs SET state='cancel_requested',cancel_requested_at=coalesce(cancel_requested_at,statement_timestamp()),version=version+1 WHERE id=r.id RETURNING * INTO r;END IF;
  INSERT INTO digitization_deletion_jobs(tenant_deletion_id,kind,run_id,digitization_id,metadata)
  SELECT request.id,'stop_run',r.id,r.digitization_id,jsonb_build_object('author',jsonb_build_object('id',r.created_by,'orgId',r.organization_id,'roles',jsonb_build_array('agent')),'sources',inputs.source_set,'stages',coalesce((SELECT jsonb_agg(to_jsonb(stage)||jsonb_build_object('fencing_token',stage.fencing_token::text,'run_budget',r.budget,'deadline',least(r.deadline,coalesce(r.started_at,statement_timestamp())+(r.budget->>'maxSeconds')::integer*interval '1 second')) ORDER BY stage.id) FROM processing_stages stage WHERE stage.run_id=r.id),'[]'::jsonb)) FROM property_input_revisions inputs WHERE inputs.digitization_id=r.digitization_id AND inputs.revision=r.input_revision;
 END LOOP;
 INSERT INTO digitization_deletion_jobs(tenant_deletion_id,kind,digitization_id,object_key,metadata) SELECT request.id,'object',ar.digitization_id,ar.object_key,jsonb_build_object('category','artifact','artifactId',ar.id) FROM artifacts ar WHERE ar.organization_id=organization_ref ON CONFLICT DO NOTHING;
 FOR a IN SELECT asset.* FROM media_assets asset WHERE asset.visibility='private' AND EXISTS(SELECT 1 FROM digitization_asset_bindings b WHERE b.asset_id=asset.id AND b.organization_id=organization_ref) ORDER BY asset.id FOR UPDATE LOOP
  retained:=digitization_asset_has_retained_reference(a.id) OR NOT EXISTS(SELECT 1 FROM memberships WHERE user_id=a.owner_id AND organization_id=organization_ref AND status='active' AND role IN('agent','agency_manager','developer')) OR EXISTS(SELECT 1 FROM digitization_asset_bindings b JOIN property_digitizations d ON d.id=b.digitization_id WHERE b.asset_id=a.id AND b.organization_id IS DISTINCT FROM organization_ref AND d.state='active' AND NOT EXISTS(SELECT 1 FROM digitization_tenant_deletions WHERE organization_id=b.organization_id));
  INSERT INTO digitization_deletion_jobs(tenant_deletion_id,kind,object_key,metadata,state) VALUES(request.id,'object','quarantine/'||a.object_key,jsonb_build_object('category','original','assetId',a.id,'retentionReason',CASE WHEN retained THEN 'owning_module_or_other_tenant_reference' ELSE NULL END),CASE WHEN retained THEN 'retained' ELSE 'pending' END);
  IF NOT retained THEN UPDATE media_assets SET status='deletion_requested',version=version+1 WHERE id=a.id;END IF;
 END LOOP;
 UPDATE digitization_evidence_grants SET state='revoked',version=version+1 WHERE organization_id=organization_ref AND state='active';
 INSERT INTO digitization_deletion_jobs(tenant_deletion_id,kind,digitization_id,object_key,upload_id,metadata) SELECT request.id,'object',c.digitization_id,c.object_key,c.upload_id,jsonb_build_object('category','capture','captureId',c.id) FROM digitization_capture_uploads c WHERE c.organization_id=organization_ref;
 INSERT INTO audit_events(actor_id,resource_id,action) VALUES(actor_id(),request.id,'digitization.tenant_deletion_requested');
 RETURN jsonb_build_object('id',request.id,'organizationId',organization_ref,'version',1,'state','requested','accessRevoked',true,'onlineCleanupComplete',false,'retainedBusinessRecords',true);
END $$;
