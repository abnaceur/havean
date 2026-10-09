-- Table-specific record fields must only be prepared inside their table branch.
CREATE OR REPLACE FUNCTION digitization_row_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE parent property_digitizations;run processing_runs;candidate fact_candidates;binding digitization_asset_bindings;
BEGIN
 IF TG_TABLE_NAME='property_digitizations' THEN
  IF TG_OP='INSERT' AND (NEW.created_by<>actor_id() OR NEW.version<>1 OR NEW.state<>'active' OR NEW.current_input_revision<>0) THEN RAISE EXCEPTION 'Initial digitization actor and workflow required' USING ERRCODE='42501';END IF;
  IF TG_OP='UPDATE' AND (NEW.created_by<>OLD.created_by OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.target_type<>OLD.target_type OR NEW.target_id<>OLD.target_id OR NEW.unit_id IS DISTINCT FROM OLD.unit_id OR NEW.listing_id IS DISTINCT FROM OLD.listing_id OR NEW.version<>OLD.version+1 OR OLD.state<>'active' OR NEW.current_input_revision<OLD.current_input_revision) THEN RAISE EXCEPTION 'Immutable digitization identity and current version required' USING ERRCODE='23514';END IF;
  IF NOT digitization_actor_target(actor_id(),NEW.organization_id,NEW.created_by,NEW.target_type,NEW.target_id,NEW.unit_id) THEN RAISE EXCEPTION 'Current digitization target authority required' USING ERRCODE='42501';END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO parent FROM property_digitizations WHERE id=NEW.digitization_id;
 IF parent.id IS NULL OR NEW.organization_id IS DISTINCT FROM parent.organization_id THEN RAISE EXCEPTION 'Matching engine organization required' USING ERRCODE='23514';END IF;
 IF TG_TABLE_NAME='digitization_evidence_grants' THEN
  IF TG_OP='INSERT' AND (NEW.version<>1 OR NEW.state<>'active' OR NEW.expires_at>statement_timestamp()+interval '90 days' OR NEW.granted_by<>actor_id() OR NEW.owner_id<>actor_id() OR NOT EXISTS(SELECT 1 FROM media_assets a WHERE a.id=NEW.asset_id AND a.owner_id=actor_id() AND a.version=NEW.asset_version AND a.status='approved' AND a.scan_at IS NOT NULL AND a.visibility='private' AND a.purpose='document') OR NOT digitization_actor_target(NEW.grantee_id,parent.organization_id,parent.created_by,parent.target_type,parent.target_id,parent.unit_id)) THEN RAISE EXCEPTION 'Owner and scoped grantee processing grant required' USING ERRCODE='42501';END IF;
  IF TG_OP='UPDATE' AND (NEW.owner_id<>OLD.owner_id OR NEW.granted_by<>OLD.granted_by OR NEW.grantee_id<>OLD.grantee_id OR NEW.digitization_id<>OLD.digitization_id OR NEW.asset_id<>OLD.asset_id OR NEW.asset_version<>OLD.asset_version OR NEW.input_revision<>OLD.input_revision OR NEW.purposes<>OLD.purposes OR NEW.expires_at<>OLD.expires_at OR NEW.version<>OLD.version+1 OR OLD.state<>'active' OR NEW.state<>'revoked') THEN RAISE EXCEPTION 'Grant revocation requires immutable identity and version' USING ERRCODE='23514';END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF TG_TABLE_NAME NOT IN('capture_sessions','processing_runs','processing_stages') OR NEW.digitization_id<>OLD.digitization_id OR NEW.created_by<>OLD.created_by OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Immutable engine snapshot or stale version' USING ERRCODE='23514';END IF;
 ELSE
  IF NEW.created_by<>actor_id() OR NEW.version<>1 THEN RAISE EXCEPTION 'Current creator and initial version required' USING ERRCODE='42501';END IF;
 END IF;
 IF TG_TABLE_NAME='digitization_asset_bindings' THEN
  IF NOT digitization_asset_access(NEW.digitization_id,NEW.asset_id,NEW.asset_version,NEW.input_revision,'document_processing') THEN RAISE EXCEPTION 'Explicit scoped processing authority required' USING ERRCODE='42501';END IF;
 END IF;
 IF TG_TABLE_NAME='document_pages' THEN
  SELECT * INTO binding FROM digitization_asset_bindings WHERE id=NEW.binding_id;IF binding.input_revision<>NEW.input_revision OR binding.purpose<>'document' THEN RAISE EXCEPTION 'Matching document input revision required' USING ERRCODE='23514';END IF;
 END IF;
 IF TG_TABLE_NAME='fact_decisions' THEN
  SELECT * INTO candidate FROM fact_candidates WHERE id=NEW.candidate_id;IF candidate.version<>NEW.candidate_version THEN RAISE EXCEPTION 'Current fact candidate required' USING ERRCODE='23514';END IF;
 END IF;
 IF TG_TABLE_NAME IN('processing_stages','artifacts') THEN
  SELECT * INTO run FROM processing_runs WHERE id=NEW.run_id;IF run.input_revision<>NEW.input_revision THEN RAISE EXCEPTION 'Matching run input revision required' USING ERRCODE='23514';END IF;
 END IF;
 IF TG_TABLE_NAME='artifacts' THEN IF NOT EXISTS(SELECT 1 FROM processing_stages st WHERE st.id=NEW.stage_id AND st.run_id=NEW.run_id AND st.input_fingerprint=NEW.input_fingerprint) THEN RAISE EXCEPTION 'Matching artifact execution lineage required' USING ERRCODE='23514';END IF;END IF;
 IF TG_TABLE_NAME='processing_stage_dependencies' THEN IF NOT EXISTS(SELECT 1 FROM processing_stages a JOIN processing_stages b ON a.run_id=b.run_id WHERE a.id=NEW.stage_id AND b.id=NEW.dependency_id) THEN RAISE EXCEPTION 'Dependencies must belong to the same run' USING ERRCODE='23514';END IF;END IF;
 RETURN NEW;
END $$;

ALTER TABLE property_digitizations ADD CONSTRAINT digitization_listing_identity CHECK(target_type<>'listing' OR listing_id IS NOT NULL AND listing_id=target_id);
