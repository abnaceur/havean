-- Positional purpose argument cannot be shadowed by media_assets.purpose.
CREATE OR REPLACE FUNCTION digitization_asset_access(engine uuid,asset uuid,asset_rev int,revision int,purpose text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT digitization_target_access(engine) AND EXISTS(SELECT 1 FROM media_assets a WHERE a.id=asset AND a.version=asset_rev AND a.status='approved' AND a.scan_at IS NOT NULL AND length(a.rights)>=3 AND (
 a.owner_id=actor_id() OR EXISTS(SELECT 1 FROM digitization_evidence_grants g WHERE g.digitization_id=engine AND g.asset_id=a.id AND g.asset_version=a.version AND g.owner_id=a.owner_id AND g.grantee_id=actor_id() AND g.input_revision=revision AND $5=ANY(g.purposes) AND g.state='active' AND g.expires_at>statement_timestamp())))
$$;
