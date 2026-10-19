-- A durable private reservation tracks every copied capture original, including
-- a crash before admission. The copy lease outlives its bounded I/O deadline.
ALTER TABLE media_assets ADD COLUMN digitization_capture_id uuid UNIQUE REFERENCES digitization_capture_uploads,ADD COLUMN capture_source_checksum text,ADD COLUMN capture_source_lease uuid,ADD COLUMN capture_copy_until timestamptz,
 ADD CONSTRAINT capture_source_lineage CHECK((digitization_capture_id IS NULL AND capture_source_checksum IS NULL AND capture_source_lease IS NULL AND capture_copy_until IS NULL) OR (digitization_capture_id IS NOT NULL AND capture_source_checksum IS NOT NULL AND capture_source_checksum~'^[a-f0-9]{64}$' AND visibility='private' AND purpose='video' AND ((capture_source_lease IS NULL AND capture_copy_until IS NULL) OR (capture_source_lease IS NOT NULL AND capture_copy_until IS NOT NULL))));
CREATE FUNCTION digitization_capture_source_origin_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE upload digitization_capture_uploads;receipt digitization_capture_receipts;workspace property_digitizations;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.digitization_capture_id IS DISTINCT FROM OLD.digitization_capture_id OR NEW.capture_source_checksum IS DISTINCT FROM OLD.capture_source_checksum) THEN RAISE EXCEPTION 'Capture source origin is immutable' USING ERRCODE='23514';END IF;
 IF NEW.digitization_capture_id IS NULL THEN RETURN NEW;END IF;
 SELECT * INTO upload FROM digitization_capture_uploads WHERE id=NEW.digitization_capture_id;
 SELECT * INTO receipt FROM digitization_capture_receipts WHERE capture_id=upload.id;
 SELECT * INTO workspace FROM property_digitizations WHERE id=upload.digitization_id;
 IF receipt.capture_id IS NULL OR upload.id IS NULL OR workspace.id IS NULL THEN RAISE EXCEPTION 'Completed capture receipt required' USING ERRCODE='23514';END IF;
 IF TG_OP='UPDATE' AND (NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.object_key IS DISTINCT FROM OLD.object_key OR NEW.mime IS DISTINCT FROM OLD.mime OR NEW.size IS DISTINCT FROM OLD.size OR NEW.rights IS DISTINCT FROM OLD.rights) THEN RAISE EXCEPTION 'Capture source identity is immutable' USING ERRCODE='23514';END IF;
 IF NEW.owner_id IS DISTINCT FROM upload.created_by OR NEW.mime IS DISTINCT FROM receipt.detected_mime OR NEW.size IS DISTINCT FROM receipt.byte_size OR NEW.capture_source_checksum IS DISTINCT FROM receipt.checksum OR NEW.visibility<>'private' OR NEW.purpose<>'video' THEN RAISE EXCEPTION 'Exact private capture source lineage required' USING ERRCODE='23514';END IF;
 IF TG_OP='UPDATE' AND (NEW.capture_source_lease IS DISTINCT FROM OLD.capture_source_lease OR NEW.capture_copy_until IS DISTINCT FROM OLD.capture_copy_until) AND NEW.capture_source_lease IS NOT NULL AND OLD.capture_copy_until>statement_timestamp() THEN RAISE EXCEPTION 'Existing capture copy lease is live' USING ERRCODE='40001';END IF;
 IF TG_OP='INSERT' AND(NEW.status<>'quarantined' OR NEW.scan_at IS NOT NULL OR NEW.version<>1 OR NEW.capture_source_lease IS NULL) THEN RAISE EXCEPTION 'Private quarantined capture copy reservation required' USING ERRCODE='23514';END IF;
 IF (TG_OP='INSERT' OR NEW.capture_source_lease IS DISTINCT FROM OLD.capture_source_lease OR NEW.capture_copy_until IS DISTINCT FROM OLD.capture_copy_until) AND NEW.capture_source_lease IS NOT NULL AND(NEW.capture_copy_until<=statement_timestamp() OR NEW.capture_copy_until>statement_timestamp()+interval '5 minutes') THEN RAISE EXCEPTION 'Bounded capture copy lease required' USING ERRCODE='23514';END IF;
 IF TG_OP='INSERT' OR (TG_OP='UPDATE' AND NEW.status='approved' AND OLD.status<>'approved') OR (TG_OP='UPDATE' AND NEW.capture_source_lease IS DISTINCT FROM OLD.capture_source_lease AND NEW.capture_source_lease IS NOT NULL) THEN
  IF upload.state<>'complete' OR workspace.state<>'active' OR NEW.owner_id<>actor_id() OR NOT digitization_private_access(workspace.id) OR NOT EXISTS(SELECT 1 FROM profiles p JOIN memberships m ON m.user_id=p.id WHERE p.id=actor_id() AND p.state='active' AND m.organization_id=workspace.organization_id AND m.status='active' AND m.role IN('agent','agency_manager')) THEN RAISE EXCEPTION 'Current private capture source actor required' USING ERRCODE='42501';END IF;
 END IF;
 IF TG_OP='UPDATE' AND NEW.status='approved' AND OLD.status<>'approved' AND(OLD.status<>'quarantined' OR OLD.capture_source_lease IS NULL OR OLD.capture_copy_until<=statement_timestamp() OR NEW.scan_at IS NULL OR NEW.capture_source_lease IS NOT NULL OR NEW.capture_copy_until IS NOT NULL) THEN RAISE EXCEPTION 'Live scanned capture copy lease required' USING ERRCODE='40001';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER capture_source_origin BEFORE INSERT OR UPDATE ON media_assets FOR EACH ROW EXECUTE FUNCTION digitization_capture_source_origin_guard();
REVOKE ALL ON FUNCTION digitization_capture_source_origin_guard() FROM PUBLIC,haven_app;

-- Include unbound capture reservations in the exact erasure scope.
CREATE OR REPLACE FUNCTION digitization_tenant_deletion_context(organization_ref uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE org organizations;request digitization_tenant_deletions;snapshot jsonb;
BEGIN
 IF NOT platform_admin_lock() THEN RAISE EXCEPTION 'Current platform administrator required' USING ERRCODE='42501';END IF;
 SELECT * INTO org FROM organizations WHERE id=organization_ref;
 IF org.id IS NULL THEN RAISE EXCEPTION 'Organization not found' USING ERRCODE='P0002';END IF;
 SELECT * INTO request FROM digitization_tenant_deletions WHERE organization_id=org.id;
 snapshot:=jsonb_build_object('organization',to_jsonb(org),'engines',coalesce((SELECT jsonb_agg(jsonb_build_array(id,version,state,current_input_revision) ORDER BY id) FROM property_digitizations WHERE organization_id=org.id),'[]'),'runs',coalesce((SELECT jsonb_agg(jsonb_build_array(id,version,state) ORDER BY id) FROM processing_runs WHERE organization_id=org.id),'[]'),'stages',coalesce((SELECT jsonb_agg(jsonb_build_array(id,version,state,fencing_token::text,execution_id) ORDER BY id) FROM processing_stages WHERE organization_id=org.id),'[]'),'assets',coalesce((SELECT jsonb_agg(jsonb_build_array(a.id,a.version,a.status) ORDER BY a.id) FROM media_assets a WHERE EXISTS(SELECT 1 FROM digitization_asset_bindings b WHERE b.asset_id=a.id AND b.organization_id=org.id) OR EXISTS(SELECT 1 FROM digitization_capture_uploads captured WHERE captured.id=a.digitization_capture_id AND captured.organization_id=org.id)),'[]'),'artifacts',coalesce((SELECT jsonb_agg(jsonb_build_array(id,version,status,checksum) ORDER BY id) FROM artifacts WHERE organization_id=org.id),'[]'),'captures',coalesce((SELECT jsonb_agg(jsonb_build_array(id,version,state) ORDER BY id) FROM digitization_capture_uploads WHERE organization_id=org.id),'[]'));
 RETURN jsonb_build_object('organizationId',org.id,'organizationName',org.name,'scopeVersion',encode(sha256(convert_to(snapshot::text,'UTF8')),'hex'),'workspaceCount',(SELECT count(*) FROM property_digitizations WHERE organization_id=org.id),'runCount',(SELECT count(*) FROM processing_runs WHERE organization_id=org.id),'sourceCount',jsonb_array_length(snapshot->'assets'),'artifactCount',jsonb_array_length(snapshot->'artifacts'),'request',CASE WHEN request.id IS NULL THEN NULL ELSE jsonb_build_object('id',request.id,'version',request.version,'state',request.state,'pendingJobs',(SELECT count(*) FROM digitization_deletion_jobs WHERE tenant_deletion_id=request.id AND state='pending'),'completedJobs',(SELECT count(*) FROM digitization_deletion_jobs WHERE tenant_deletion_id=request.id AND state='complete'),'retainedOriginals',(SELECT count(*) FROM digitization_deletion_jobs WHERE tenant_deletion_id=request.id AND state='retained')) END);
END $$;
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
 PERFORM 1 FROM media_assets locked_asset WHERE (EXISTS(SELECT 1 FROM digitization_asset_bindings b WHERE b.asset_id=locked_asset.id AND b.organization_id=organization_ref) OR EXISTS(SELECT 1 FROM digitization_capture_uploads captured WHERE captured.id=locked_asset.digitization_capture_id AND captured.organization_id=organization_ref)) ORDER BY locked_asset.id FOR UPDATE;
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
 FOR a IN SELECT asset.* FROM media_assets asset WHERE asset.visibility='private' AND (EXISTS(SELECT 1 FROM digitization_asset_bindings b WHERE b.asset_id=asset.id AND b.organization_id=organization_ref) OR EXISTS(SELECT 1 FROM digitization_capture_uploads captured WHERE captured.id=asset.digitization_capture_id AND captured.organization_id=organization_ref)) ORDER BY asset.id FOR UPDATE LOOP
  retained:=digitization_asset_has_retained_reference(a.id) OR NOT EXISTS(SELECT 1 FROM memberships WHERE user_id=a.owner_id AND organization_id=organization_ref AND status='active' AND role IN('agent','agency_manager','developer')) OR EXISTS(SELECT 1 FROM digitization_asset_bindings b JOIN property_digitizations d ON d.id=b.digitization_id WHERE b.asset_id=a.id AND b.organization_id IS DISTINCT FROM organization_ref AND d.state='active' AND NOT EXISTS(SELECT 1 FROM digitization_tenant_deletions WHERE organization_id=b.organization_id));
  INSERT INTO digitization_deletion_jobs(tenant_deletion_id,kind,object_key,metadata,state) VALUES(request.id,'object','quarantine/'||a.object_key,jsonb_build_object('category','original','assetId',a.id,'retentionReason',CASE WHEN retained THEN 'owning_module_or_other_tenant_reference' ELSE NULL END),CASE WHEN retained THEN 'retained' ELSE 'pending' END);
  IF NOT retained THEN UPDATE media_assets SET status='deletion_requested',version=version+1 WHERE id=a.id;END IF;
 END LOOP;
 UPDATE digitization_evidence_grants SET state='revoked',version=version+1 WHERE organization_id=organization_ref AND state='active';
 INSERT INTO digitization_deletion_jobs(tenant_deletion_id,kind,digitization_id,object_key,upload_id,metadata) SELECT request.id,'object',c.digitization_id,c.object_key,c.upload_id,jsonb_build_object('category','capture','captureId',c.id) FROM digitization_capture_uploads c WHERE c.organization_id=organization_ref;
 INSERT INTO audit_events(actor_id,resource_id,action) VALUES(actor_id(),request.id,'digitization.tenant_deletion_requested');
 RETURN jsonb_build_object('id',request.id,'organizationId',organization_ref,'version',1,'state','requested','accessRevoked',true,'onlineCleanupComplete',false,'retainedBusinessRecords',true);
END $$;
-- A copy lease outlives all bounded storage I/O, including process interruption.
CREATE OR REPLACE FUNCTION digitization_claim_deletion_job() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE job digitization_deletion_jobs;
BEGIN
 IF actor_id() IS DISTINCT FROM '00000000-0000-4000-8000-000000000010'::uuid THEN RAISE EXCEPTION 'Trusted deletion maintenance identity required' USING ERRCODE='42501';END IF;
 SELECT * INTO job FROM digitization_deletion_jobs j WHERE j.state='pending' AND NOT EXISTS(SELECT 1 FROM media_assets copying WHERE copying.id::text=j.metadata->>'assetId' AND copying.capture_copy_until>statement_timestamp()) AND (j.lease_until IS NULL OR j.lease_until<=statement_timestamp()) AND ((j.user_id IS NOT NULL AND EXISTS(SELECT 1 FROM profiles WHERE id=j.user_id AND state='deletion_requested')) OR (j.tenant_deletion_id IS NOT NULL AND EXISTS(SELECT 1 FROM digitization_tenant_deletions WHERE id=j.tenant_deletion_id AND state='requested'))) AND (j.kind='stop_run' OR NOT EXISTS(SELECT 1 FROM digitization_deletion_jobs stop WHERE stop.kind='stop_run' AND stop.state='pending' AND (stop.user_id=j.user_id OR stop.tenant_deletion_id=j.tenant_deletion_id))) ORDER BY CASE kind WHEN 'stop_run' THEN 0 ELSE 1 END,j.created_at,j.id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL;END IF;
 UPDATE digitization_deletion_jobs SET fence=fence+1,lease_until=statement_timestamp()+interval '60 seconds' WHERE id=job.id RETURNING * INTO job;
 RETURN to_jsonb(job)||jsonb_build_object('fence',job.fence::text);
END $$;

CREATE FUNCTION digitization_capture_binding_origin_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE source media_assets;capture digitization_capture_uploads;
BEGIN
 SELECT * INTO source FROM media_assets WHERE id=NEW.asset_id;
 IF source.digitization_capture_id IS NULL THEN RETURN NEW;END IF;
 SELECT * INTO capture FROM digitization_capture_uploads WHERE id=source.digitization_capture_id;
 IF capture.digitization_id IS DISTINCT FROM NEW.digitization_id OR capture.state<>'complete' OR source.status<>'approved' OR source.scan_at IS NULL OR source.capture_source_lease IS NOT NULL OR NEW.purpose<>'video' THEN RAISE EXCEPTION 'Admitted capture belongs to its exact private workspace' USING ERRCODE='42501';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER capture_binding_origin BEFORE INSERT ON digitization_asset_bindings FOR EACH ROW EXECUTE FUNCTION digitization_capture_binding_origin_guard();
REVOKE ALL ON FUNCTION digitization_capture_binding_origin_guard() FROM PUBLIC,haven_app;
