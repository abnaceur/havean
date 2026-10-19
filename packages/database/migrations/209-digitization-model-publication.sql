-- Model candidates enter the existing inventory revision workflow. The private
-- snapshot remains private; only an allowlisted manifest and derivative serve.
CREATE FUNCTION digitization_model_publication_current(proposal_ref uuid) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM digitization_model_publication_proposals p JOIN digitization_model_review_requests q ON q.id=p.model_review_request_id JOIN approval_records a ON a.id=p.approval_id JOIN property_digitizations d ON d.id=p.digitization_id JOIN listing_revisions r ON r.id=p.listing_revision_id JOIN listings l ON l.id=r.listing_id
 WHERE p.id=proposal_ref AND p.created_by=q.created_by AND p.organization_id=q.organization_id AND p.digitization_id=q.digitization_id AND p.input_revision=q.input_revision AND p.workspace_version=q.workspace_version AND p.publication_consent_confirmed AND digitization_model_review_current(q.id)
 AND a.digitization_id=q.digitization_id AND a.input_revision=q.input_revision AND a.created_by=q.reviewer_id AND a.decision='approved' AND a.snapshot->>'kind'='reviewed_model' AND a.snapshot->>'modelReviewRequestId'=q.id::text AND a.snapshot->>'candidateChecksum'=q.candidate_checksum AND a.snapshot->'privacyConfirmed'='true'::jsonb AND a.snapshot->'limitationsConfirmed'='true'::jsonb
 AND NOT EXISTS(SELECT 1 FROM digitization_approval_invalidations i WHERE i.approval_id=a.id AND i.input_revision<=p.input_revision)
 AND d.target_type='listing' AND d.target_id=l.id AND d.listing_id=l.id AND r.actor_id=p.created_by AND r.changes->'digitizationPackage'->>'approvalId'=a.id::text AND r.changes->'digitizationPackage'->>'engineId'=d.id::text AND NOT(r.changes?'unitFacts')
 AND r.status='pending' AND l.status='published' AND l.version=r.base_version)
$$;
CREATE FUNCTION digitization_model_proposal_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP<>'INSERT' OR NEW.created_by<>actor_id() OR NEW.organization_id<>org_id() THEN RAISE EXCEPTION 'Immutable model publication author required' USING ERRCODE='42501';END IF;
 IF NOT digitization_model_publication_current(NEW.id) THEN RAISE EXCEPTION 'Current reviewed model and pending listing revision required' USING ERRCODE='40001';END IF;RETURN NEW;
END $$;
CREATE TRIGGER model_proposal_final_guard AFTER INSERT OR UPDATE OR DELETE ON digitization_model_publication_proposals FOR EACH ROW EXECUTE FUNCTION digitization_model_proposal_guard();
CREATE POLICY model_proposal_create ON digitization_model_publication_proposals FOR INSERT WITH CHECK(created_by=actor_id() AND organization_id=org_id() AND digitization_private_access(digitization_id));
GRANT INSERT ON digitization_model_publication_proposals TO haven_app;

CREATE FUNCTION digitization_model_publication_review_context(revision_ref uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p digitization_model_publication_proposals;q digitization_model_review_requests;
BEGIN
 SELECT * INTO p FROM digitization_model_publication_proposals WHERE listing_revision_id=revision_ref;IF p.id IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO q FROM digitization_model_review_requests WHERE id=p.model_review_request_id;
 IF q.reviewer_id<>actor_id() OR p.created_by=actor_id() OR NOT digitization_current_tour_reviewer(actor_id()) THEN RAISE EXCEPTION 'Independent assigned model publication reviewer required' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM property_digitizations WHERE id=p.digitization_id FOR UPDATE;
 PERFORM 1 FROM listings WHERE id=(SELECT listing_id FROM listing_revisions WHERE id=revision_ref) FOR UPDATE;
 PERFORM 1 FROM listing_mandates WHERE unit_id=(SELECT unit_id FROM property_digitizations WHERE id=p.digitization_id) AND organization_id=p.organization_id FOR SHARE;
 PERFORM 1 FROM profiles WHERE id IN(p.created_by,q.reviewer_id) FOR SHARE;
 PERFORM 1 FROM memberships WHERE user_id IN(p.created_by,q.reviewer_id) FOR SHARE;
 PERFORM 1 FROM media_assets WHERE id IN(SELECT (source->>'assetId')::uuid FROM jsonb_array_elements(q.sources) source) FOR SHARE;
 IF q.geometry_revision_id IS NOT NULL THEN PERFORM 1 FROM geometry_revisions WHERE id=q.geometry_revision_id FOR SHARE;END IF;
 IF q.scene_artifact_id IS NOT NULL THEN PERFORM 1 FROM artifacts WHERE id=q.scene_artifact_id FOR SHARE;END IF;
 IF NOT digitization_model_publication_current(p.id) THEN RAISE EXCEPTION 'Model publication dependencies changed' USING ERRCODE='40001';END IF;
 RETURN digitization_model_review_context(q.id);
END $$;

-- Preserve the trigger OID and the exact existing panorama branch.
CREATE OR REPLACE FUNCTION digitization_package_freshness_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.manifest->>'viewerType' IN('structural','splat') THEN
  IF NEW.listing_revision_id IS NULL OR NOT EXISTS(SELECT 1 FROM approval_records pa JOIN digitization_model_publication_proposals p ON p.id::text=pa.snapshot->>'modelProposalId' JOIN digitization_model_review_requests q ON q.id=p.model_review_request_id JOIN approval_records a ON a.id=p.approval_id JOIN listing_revisions r ON r.id=p.listing_revision_id JOIN listings l ON l.id=r.listing_id
   WHERE pa.id=NEW.approval_id AND pa.scope='package' AND pa.decision='approved' AND pa.created_by=actor_id() AND pa.snapshot->>'kind'='reviewed_inventory_model_package' AND pa.snapshot->>'candidateChecksum'=q.candidate_checksum AND pa.snapshot->>'modelApprovalId'=a.id::text AND pa.snapshot->>'listingRevisionId'=r.id::text AND a.decision='approved' AND a.snapshot->>'modelReviewRequestId'=q.id::text
   AND q.reviewer_id=actor_id() AND q.created_by<>actor_id() AND digitization_current_tour_reviewer(actor_id()) AND digitization_model_review_current(q.id) AND p.listing_revision_id=NEW.listing_revision_id AND p.digitization_id=NEW.digitization_id AND p.input_revision=NEW.input_revision AND r.status='approved' AND r.reviewed_by=actor_id() AND l.status='published' AND l.version=NEW.listing_version AND l.version=r.base_version+1
   AND NEW.manifest=digitization_model_manifest(q.model_type,q.candidate_checksum)) THEN RAISE EXCEPTION 'Reviewed exact inventory model package required' USING ERRCODE='42501';END IF;
 ELSE
  IF NEW.listing_revision_id IS NULL OR NOT EXISTS(SELECT 1 FROM approval_records a JOIN digitization_publication_proposals p ON p.id::text=a.snapshot->>'proposalId' JOIN listing_revisions r ON r.id=p.listing_revision_id JOIN listings l ON l.id=r.listing_id
   WHERE a.id=NEW.approval_id AND a.scope='package' AND a.decision='approved' AND a.created_by=actor_id() AND p.listing_revision_id=NEW.listing_revision_id AND p.digitization_id=NEW.digitization_id AND p.input_revision=NEW.input_revision AND r.status='approved' AND r.reviewed_by=actor_id() AND l.status='published' AND l.version=NEW.listing_version AND l.version=r.base_version+1) THEN RAISE EXCEPTION 'Reviewed current inventory package required' USING ERRCODE='42501';END IF;
 END IF;RETURN NEW;
END $$;
CREATE FUNCTION digitization_model_manifest(model_type_ref text,checksum_ref text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_build_object('schemaVersion',1,'viewerType',model_type_ref,'candidateChecksum',checksum_ref,'scaleStatus',CASE WHEN model_type_ref='structural' THEN 'estimated' ELSE 'unscaled' END,'metricMeasurementsAvailable',false,'limitations',jsonb_build_array(CASE WHEN model_type_ref='structural' THEN 'Estimated structural visualization; supplied dimensions are unverified. No official survey or metric measurement.' ELSE 'Unscaled reconstructed visualization; incomplete surfaces and rooms may be unavailable. No metric measurement.' END))
$$;
CREATE FUNCTION digitization_commit_model_publication(revision_ref uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p digitization_model_publication_proposals;q digitization_model_review_requests;r listing_revisions;l listings;a approval_records;pa approval_records;pkg published_packages;
BEGIN
 SELECT * INTO p FROM digitization_model_publication_proposals WHERE listing_revision_id=revision_ref;IF p.id IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO q FROM digitization_model_review_requests WHERE id=p.model_review_request_id;
 SELECT * INTO r FROM listing_revisions WHERE id=revision_ref;SELECT * INTO l FROM listings WHERE id=r.listing_id;
 IF q.reviewer_id<>actor_id() OR p.created_by=actor_id() OR NOT digitization_current_tour_reviewer(actor_id()) OR r.status<>'approved' OR r.reviewed_by<>actor_id() OR l.version<>r.base_version+1 OR l.status<>'published' OR NOT digitization_model_review_current(q.id) THEN RAISE EXCEPTION 'Current independent inventory model decision required' USING ERRCODE='42501';END IF;
 SELECT * INTO a FROM approval_records WHERE id=p.approval_id AND decision='approved' AND snapshot->>'modelReviewRequestId'=q.id::text;
 IF a.id IS NULL OR EXISTS(SELECT 1 FROM digitization_approval_invalidations WHERE approval_id=a.id AND input_revision<=p.input_revision) THEN RAISE EXCEPTION 'Model approval changed' USING ERRCODE='40001';END IF;
 INSERT INTO approval_records(digitization_id,organization_id,created_by,input_revision,scope,snapshot,decision,reason) VALUES(p.digitization_id,p.organization_id,actor_id(),p.input_revision,'package',jsonb_build_object('kind','reviewed_inventory_model_package','modelProposalId',p.id,'modelApprovalId',a.id,'candidateChecksum',q.candidate_checksum,'listingRevisionId',r.id),'approved',r.review_reason) RETURNING * INTO pa;
 INSERT INTO published_packages(digitization_id,organization_id,created_by,listing_id,listing_version,input_revision,approval_id,manifest,publication_number,listing_revision_id) VALUES(p.digitization_id,p.organization_id,actor_id(),l.id,l.version,p.input_revision,pa.id,digitization_model_manifest(q.model_type,q.candidate_checksum),(SELECT coalesce(max(publication_number),0)+1 FROM published_packages WHERE listing_id=l.id),r.id) RETURNING * INTO pkg;
 RETURN pkg.id;
END $$;

-- Serving uses the immutable reviewed snapshot. New private draft edits do not
-- become public, while current source/mandate/account revocation removes access.
CREATE FUNCTION digitization_public_model(listing_ref uuid,package_ref uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE pkg published_packages;p digitization_model_publication_proposals;q digitization_model_review_requests;roles text[];
BEGIN
 SELECT * INTO pkg FROM published_packages WHERE listing_id=listing_ref ORDER BY publication_number DESC LIMIT 1;
 IF pkg.id IS NULL OR pkg.manifest->>'viewerType' NOT IN('structural','splat') OR (package_ref IS NOT NULL AND package_ref<>pkg.id) OR EXISTS(SELECT 1 FROM digitization_package_revocations WHERE package_id=pkg.id) OR NOT EXISTS(SELECT 1 FROM public_listings WHERE id=listing_ref) THEN RETURN NULL;END IF;
 SELECT * INTO p FROM digitization_model_publication_proposals WHERE listing_revision_id=pkg.listing_revision_id;SELECT * INTO q FROM digitization_model_review_requests WHERE id=p.model_review_request_id;
 IF p.id IS NULL OR q.id IS NULL OR NOT p.publication_consent_confirmed OR NOT EXISTS(SELECT 1 FROM property_digitizations WHERE id=p.digitization_id AND state='active') OR NOT digitization_actor_target(p.created_by,p.organization_id,p.created_by,'listing',listing_ref,(SELECT unit_id FROM listings WHERE id=listing_ref)) OR NOT EXISTS(SELECT 1 FROM profiles pr JOIN memberships m ON m.user_id=pr.id JOIN organizations o ON o.id=m.organization_id WHERE pr.id=p.created_by AND pr.state='active' AND m.organization_id=p.organization_id AND m.status='active' AND m.role IN('agent','agency_manager') AND o.type='agency') THEN RETURN NULL;END IF;
 IF NOT EXISTS(SELECT 1 FROM approval_records pa JOIN approval_records a ON a.id=p.approval_id WHERE pa.id=pkg.approval_id AND pa.scope='package' AND pa.decision='approved' AND pa.snapshot->>'modelProposalId'=p.id::text AND pa.snapshot->>'candidateChecksum'=q.candidate_checksum AND a.decision='approved' AND a.snapshot->>'modelReviewRequestId'=q.id::text AND a.snapshot->'privacyConfirmed'='true'::jsonb AND a.snapshot->'limitationsConfirmed'='true'::jsonb AND NOT EXISTS(SELECT 1 FROM digitization_approval_invalidations i WHERE i.approval_id IN(pa.id,a.id) AND i.input_revision<=pkg.input_revision)) OR pkg.manifest<>digitization_model_manifest(q.model_type,q.candidate_checksum) THEN RETURN NULL;END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(q.sources) source LEFT JOIN media_assets a ON a.id=(source->>'assetId')::uuid WHERE a.id IS NULL OR a.owner_id<>p.created_by OR a.status<>'approved' OR a.visibility<>'private' OR a.scan_at IS NULL OR a.version IS DISTINCT FROM (source->>'assetVersion')::integer OR a.size::text IS DISTINCT FROM source->>'bytes' OR a.mime IS DISTINCT FROM source->>'detectedMime') THEN RETURN NULL;END IF;
 IF q.model_type='splat' AND NOT EXISTS(SELECT 1 FROM artifacts ar JOIN processing_stages stage ON stage.id=ar.stage_id WHERE ar.id=q.scene_artifact_id AND ar.digitization_id=p.digitization_id AND ar.input_revision=p.input_revision AND ar.version=q.scene_artifact_version AND ar.checksum=q.scene_artifact_checksum AND ar.status='private' AND ar.format='application/octet-stream' AND stage.state='succeeded' AND stage.stage_type='scene_export') THEN RETURN NULL;END IF;
 SELECT array_agg(DISTINCT role) INTO roles FROM memberships WHERE user_id=p.created_by AND organization_id=p.organization_id AND status='active' AND role IN('agent','agency_manager');
 RETURN jsonb_build_object('packageId',pkg.id,'version',pkg.version,'publicationNumber',pkg.publication_number,'manifest',pkg.manifest,'engineId',pkg.digitization_id,'inputRevision',pkg.input_revision,'request',to_jsonb(q),'author',jsonb_build_object('id',p.created_by,'orgId',p.organization_id,'roles',to_jsonb(roles)));
END $$;
REVOKE ALL ON FUNCTION digitization_model_publication_current(uuid),digitization_model_proposal_guard(),digitization_model_manifest(text,text) FROM PUBLIC,haven_app;
REVOKE ALL ON FUNCTION digitization_model_publication_review_context(uuid),digitization_commit_model_publication(uuid),digitization_public_model(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION digitization_model_publication_review_context(uuid),digitization_commit_model_publication(uuid),digitization_public_model(uuid,uuid) TO haven_app;
