CREATE FUNCTION tenant_lease_lock(target uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM 1 FROM leases l JOIN tenants t ON t.id=l.tenant_id JOIN profiles p ON p.id=t.user_id WHERE l.id=target AND l.status IN ('active','ended') AND t.user_id=actor_id() AND p.state='active' AND p.email_verified=true FOR SHARE OF l,t,p;
 RETURN FOUND;
END $$;
CREATE FUNCTION tenant_lease_document_lock(target_lease uuid,target_asset uuid) RETURNS TABLE(id uuid,version int,object_key text,mime text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT tenant_lease_lock(target_lease) THEN RETURN;END IF;
 RETURN QUERY SELECT a.id,a.version,a.object_key,a.mime FROM lease_documents d JOIN media_assets a ON a.id=d.asset_id AND a.version=d.asset_version WHERE d.lease_id=target_lease AND d.asset_id=target_asset AND a.status='approved' AND a.scan_at IS NOT NULL AND a.visibility='private' AND a.purpose='document' AND a.mime='application/pdf' FOR SHARE OF d,a;
END $$;
REVOKE ALL ON FUNCTION tenant_lease_lock(uuid),tenant_lease_document_lock(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenant_lease_lock(uuid),tenant_lease_document_lock(uuid,uuid) TO haven_app;
