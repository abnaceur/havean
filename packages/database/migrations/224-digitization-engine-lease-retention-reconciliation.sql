-- Reconcile only already-requested erasures that were incorrectly retained by
-- the new engine lease FK. Genuine module/foreign-tenant references still win.
DO $$
DECLARE job digitization_deletion_jobs;asset media_assets;tenant_ref uuid;eligible boolean;
BEGIN
 FOR job IN SELECT * FROM digitization_deletion_jobs WHERE kind='object' AND state='retained' AND metadata->>'category'='original' ORDER BY id FOR UPDATE LOOP
  SELECT * INTO asset FROM media_assets WHERE id::text=job.metadata->>'assetId' FOR UPDATE;
  IF asset.id IS NULL OR asset.visibility<>'private' OR NOT EXISTS(SELECT 1 FROM digitization_output_writes writer WHERE writer.asset_id=asset.id) OR digitization_asset_has_retained_reference(asset.id) THEN CONTINUE;END IF;
  eligible:=false;
  IF job.user_id IS NOT NULL THEN
   eligible:=asset.owner_id=job.user_id AND EXISTS(SELECT 1 FROM profiles p JOIN account_deletion_requests request ON request.user_id=p.id WHERE p.id=job.user_id AND p.state='deletion_requested');
  ELSE
   SELECT organization_id INTO tenant_ref FROM digitization_tenant_deletions WHERE id=job.tenant_deletion_id AND state='requested';
   eligible:=tenant_ref IS NOT NULL AND EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=asset.owner_id AND m.organization_id=tenant_ref AND m.status='active' AND m.role IN('agent','agency_manager','developer')) AND NOT EXISTS(SELECT 1 FROM digitization_asset_bindings b JOIN property_digitizations d ON d.id=b.digitization_id WHERE b.asset_id=asset.id AND b.organization_id IS DISTINCT FROM tenant_ref AND d.state='active' AND NOT EXISTS(SELECT 1 FROM digitization_tenant_deletions request WHERE request.organization_id=b.organization_id));
  END IF;
  IF eligible THEN
   UPDATE digitization_deletion_jobs SET state='pending',metadata=metadata||jsonb_build_object('retentionReason',NULL) WHERE id=job.id;
   IF asset.status<>'deletion_requested' THEN UPDATE media_assets SET status='deletion_requested',version=version+1 WHERE id=asset.id;END IF;
  END IF;
 END LOOP;
END $$;
