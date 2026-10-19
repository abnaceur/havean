-- Inventory-engine tenant erasure does not delete posted finance, memberships,
-- canonical units/listings or owning-module history. It permanently cuts off
-- this organization's engine access and queues verified online cleanup.
CREATE TABLE digitization_tenant_deletions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL UNIQUE REFERENCES organizations,created_by uuid NOT NULL REFERENCES profiles,version integer NOT NULL DEFAULT 1 CHECK(version=1),state text NOT NULL DEFAULT 'requested' CHECK(state='requested'),scope_version text NOT NULL CHECK(scope_version~'^[a-f0-9]{64}$'),reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 10 AND 1000),deletion_confirmed boolean NOT NULL CHECK(deletion_confirmed),created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE digitization_tenant_deletions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_deletion_admin_read ON digitization_tenant_deletions FOR SELECT USING(platform_admin_lock());
CREATE TRIGGER tenant_deletion_immutable BEFORE UPDATE OR DELETE ON digitization_tenant_deletions FOR EACH ROW EXECUTE FUNCTION digitization_immutable_publication();
ALTER TABLE digitization_deletion_jobs ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE digitization_deletion_jobs ADD COLUMN tenant_deletion_id uuid REFERENCES digitization_tenant_deletions,ADD CONSTRAINT deletion_job_one_owner CHECK(num_nonnulls(user_id,tenant_deletion_id)=1);
CREATE UNIQUE INDEX tenant_stop_job_once ON digitization_deletion_jobs(tenant_deletion_id,run_id) WHERE tenant_deletion_id IS NOT NULL AND kind='stop_run';
CREATE UNIQUE INDEX tenant_object_job_once ON digitization_deletion_jobs(tenant_deletion_id,object_key) WHERE tenant_deletion_id IS NOT NULL AND kind='object';

-- Retain the original function OID so every existing private/public policy and
-- assigned-review function acquires the permanent tenant tombstone check.
CREATE OR REPLACE FUNCTION digitization_actor_target(who uuid,workspace uuid,creator uuid,kind text,target uuid,unit_ref uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT NOT EXISTS(SELECT 1 FROM digitization_tenant_deletions WHERE organization_id=workspace) AND EXISTS(SELECT 1 FROM profiles WHERE id=who AND state='active') AND CASE kind
 WHEN 'intake' THEN who=creator AND workspace IS NOT NULL AND EXISTS(
  SELECT 1 FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=who AND m.organization_id=workspace AND m.status='active' AND m.role IN('agent','agency_manager') AND o.type='agency')
 WHEN 'listing' THEN EXISTS(SELECT 1 FROM listings l JOIN units u ON u.id=l.unit_id WHERE l.id=target AND l.organization_id=workspace AND l.unit_id=unit_ref AND (
  (l.owner_id=who AND EXISTS(SELECT 1 FROM owner_unit_grants g WHERE g.owner_id=who AND g.unit_id=l.unit_id AND g.status='active' AND (g.expires_at IS NULL OR g.expires_at>statement_timestamp()))) OR
  (EXISTS(SELECT 1 FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=who AND m.organization_id=workspace AND m.status='active' AND o.type='agency' AND (m.role='agency_manager' OR m.role='agent' AND EXISTS(SELECT 1 FROM agents a WHERE a.id=l.agent_id AND a.user_id=who AND a.organization_id=workspace))) AND
   (u.organization_id=workspace OR EXISTS(SELECT 1 FROM listing_mandates mandate WHERE mandate.unit_id=l.unit_id AND mandate.organization_id=workspace AND mandate.owner_id=l.owner_id AND mandate.status='active' AND mandate.starts_at<=statement_timestamp() AND mandate.expires_at>statement_timestamp())))))
 WHEN 'owner_submission' THEN workspace IS NULL AND who=creator AND EXISTS(SELECT 1 FROM owner_submissions os WHERE os.id=target AND os.user_id=who AND os.status IN('draft','submitted','needs_changes'))
 WHEN 'development_floor_type' THEN EXISTS(SELECT 1 FROM floor_plans f JOIN developments d ON d.id=f.development_id JOIN memberships m ON m.organization_id=d.organization_id WHERE f.id=target AND d.organization_id=workspace AND m.user_id=who AND m.status='active' AND m.role='developer')
 ELSE false END
$$;
CREATE FUNCTION digitization_tenant_write_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE workspace_ref uuid;
BEGIN
 workspace_ref:=NEW.organization_id;
 IF workspace_ref IS NOT NULL THEN
  PERFORM 1 FROM organizations WHERE id=workspace_ref FOR SHARE;
  IF EXISTS(SELECT 1 FROM digitization_tenant_deletions WHERE organization_id=workspace_ref) THEN RAISE EXCEPTION 'Tenant digitization data is under deletion' USING ERRCODE='42501';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER tenant_engine_creation_guard BEFORE INSERT ON property_digitizations FOR EACH ROW EXECUTE FUNCTION digitization_tenant_write_guard();

CREATE FUNCTION digitization_tenant_deletion_context(organization_ref uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE org organizations;request digitization_tenant_deletions;snapshot jsonb;
BEGIN
 IF NOT platform_admin_lock() THEN RAISE EXCEPTION 'Current platform administrator required' USING ERRCODE='42501';END IF;
 SELECT * INTO org FROM organizations WHERE id=organization_ref;
 IF org.id IS NULL THEN RAISE EXCEPTION 'Organization not found' USING ERRCODE='P0002';END IF;
 SELECT * INTO request FROM digitization_tenant_deletions WHERE organization_id=org.id;
 snapshot:=jsonb_build_object('organization',to_jsonb(org),'engines',coalesce((SELECT jsonb_agg(jsonb_build_array(id,version,state,current_input_revision) ORDER BY id) FROM property_digitizations WHERE organization_id=org.id),'[]'),'runs',coalesce((SELECT jsonb_agg(jsonb_build_array(id,version,state) ORDER BY id) FROM processing_runs WHERE organization_id=org.id),'[]'),'stages',coalesce((SELECT jsonb_agg(jsonb_build_array(id,version,state,fencing_token::text,execution_id) ORDER BY id) FROM processing_stages WHERE organization_id=org.id),'[]'),'assets',coalesce((SELECT jsonb_agg(jsonb_build_array(a.id,a.version,a.status) ORDER BY a.id) FROM media_assets a WHERE EXISTS(SELECT 1 FROM digitization_asset_bindings b WHERE b.asset_id=a.id AND b.organization_id=org.id)),'[]'),'artifacts',coalesce((SELECT jsonb_agg(jsonb_build_array(id,version,status,checksum) ORDER BY id) FROM artifacts WHERE organization_id=org.id),'[]'),'captures',coalesce((SELECT jsonb_agg(jsonb_build_array(id,version,state) ORDER BY id) FROM digitization_capture_uploads WHERE organization_id=org.id),'[]'));
 RETURN jsonb_build_object('organizationId',org.id,'organizationName',org.name,'scopeVersion',encode(sha256(convert_to(snapshot::text,'UTF8')),'hex'),'workspaceCount',(SELECT count(*) FROM property_digitizations WHERE organization_id=org.id),'runCount',(SELECT count(*) FROM processing_runs WHERE organization_id=org.id),'sourceCount',jsonb_array_length(snapshot->'assets'),'artifactCount',jsonb_array_length(snapshot->'artifacts'),'request',CASE WHEN request.id IS NULL THEN NULL ELSE jsonb_build_object('id',request.id,'version',request.version,'state',request.state,'pendingJobs',(SELECT count(*) FROM digitization_deletion_jobs WHERE tenant_deletion_id=request.id AND state='pending'),'completedJobs',(SELECT count(*) FROM digitization_deletion_jobs WHERE tenant_deletion_id=request.id AND state='complete'),'retainedOriginals',(SELECT count(*) FROM digitization_deletion_jobs WHERE tenant_deletion_id=request.id AND state='retained')) END);
END $$;
CREATE FUNCTION digitization_request_tenant_deletion(organization_ref uuid,scope_ref text,confirmed boolean,reason_ref text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE context jsonb;request digitization_tenant_deletions;r processing_runs;a media_assets;retained boolean;
BEGIN
 IF NOT platform_admin_lock() THEN RAISE EXCEPTION 'Current platform administrator required' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM organizations WHERE id=organization_ref FOR UPDATE;
 PERFORM 1 FROM property_digitizations WHERE organization_id=organization_ref ORDER BY id FOR UPDATE;
 PERFORM 1 FROM processing_runs WHERE organization_id=organization_ref ORDER BY id FOR UPDATE;
 PERFORM 1 FROM processing_stages WHERE organization_id=organization_ref ORDER BY id FOR UPDATE;
 PERFORM 1 FROM artifacts WHERE organization_id=organization_ref ORDER BY id FOR SHARE;
 PERFORM 1 FROM digitization_capture_uploads WHERE organization_id=organization_ref ORDER BY id FOR UPDATE;
 PERFORM 1 FROM media_assets a WHERE EXISTS(SELECT 1 FROM digitization_asset_bindings b WHERE b.asset_id=a.id AND b.organization_id=organization_ref) ORDER BY a.id FOR UPDATE;
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
CREATE OR REPLACE FUNCTION digitization_claim_deletion_job() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE job digitization_deletion_jobs;
BEGIN
 IF actor_id() IS DISTINCT FROM '00000000-0000-4000-8000-000000000010'::uuid THEN RAISE EXCEPTION 'Trusted deletion maintenance identity required' USING ERRCODE='42501';END IF;
 SELECT * INTO job FROM digitization_deletion_jobs j WHERE j.state='pending' AND (j.lease_until IS NULL OR j.lease_until<=statement_timestamp()) AND ((j.user_id IS NOT NULL AND EXISTS(SELECT 1 FROM profiles WHERE id=j.user_id AND state='deletion_requested')) OR (j.tenant_deletion_id IS NOT NULL AND EXISTS(SELECT 1 FROM digitization_tenant_deletions WHERE id=j.tenant_deletion_id AND state='requested'))) AND (j.kind='stop_run' OR NOT EXISTS(SELECT 1 FROM digitization_deletion_jobs stop WHERE stop.kind='stop_run' AND stop.state='pending' AND (stop.user_id=j.user_id OR stop.tenant_deletion_id=j.tenant_deletion_id))) ORDER BY CASE kind WHEN 'stop_run' THEN 0 ELSE 1 END,j.created_at,j.id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL;END IF;
 UPDATE digitization_deletion_jobs SET fence=fence+1,lease_until=statement_timestamp()+interval '60 seconds' WHERE id=job.id RETURNING * INTO job;
 RETURN to_jsonb(job)||jsonb_build_object('fence',job.fence::text);
END $$;
REVOKE ALL ON FUNCTION digitization_tenant_write_guard() FROM PUBLIC,haven_app;
REVOKE ALL ON FUNCTION digitization_tenant_deletion_context(uuid),digitization_request_tenant_deletion(uuid,text,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION digitization_tenant_deletion_context(uuid),digitization_request_tenant_deletion(uuid,text,boolean,text) TO haven_app;
GRANT SELECT ON digitization_tenant_deletions TO haven_app;
