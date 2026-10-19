-- Explicit owner opt-ins remain independent of existing source preview and
-- processing permission. Exact engine/input/source versions never carry over.
ALTER TABLE digitization_evidence_grants DROP CONSTRAINT digitization_evidence_grants_purposes_check;
ALTER TABLE digitization_evidence_grants ADD COLUMN model_review_consent boolean NOT NULL DEFAULT false,ADD COLUMN model_publication_consent boolean NOT NULL DEFAULT false,
 ADD CONSTRAINT evidence_grant_purpose_consent CHECK(cardinality(purposes)>0 AND purposes<@ARRAY['preview','document_processing','model_review','model_publication']::text[] AND (NOT('model_review'=ANY(purposes)) OR model_review_consent AND ARRAY['preview','document_processing']::text[]<@purposes) AND (NOT('model_publication'=ANY(purposes)) OR model_publication_consent AND 'model_review'=ANY(purposes)));
CREATE FUNCTION digitization_model_consent_immutable() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.model_review_consent IS DISTINCT FROM OLD.model_review_consent OR NEW.model_publication_consent IS DISTINCT FROM OLD.model_publication_consent THEN RAISE EXCEPTION 'Source model consent is immutable' USING ERRCODE='23514';END IF;RETURN NEW;
END $$;
CREATE TRIGGER model_source_consent_immutable BEFORE UPDATE ON digitization_evidence_grants FOR EACH ROW EXECUTE FUNCTION digitization_model_consent_immutable();
CREATE FUNCTION digitization_model_source_authority(author_ref uuid,engine_ref uuid,asset_ref uuid,asset_version_ref integer,revision_ref integer,purpose_ref text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT purpose_ref IN('model_review','model_publication') AND EXISTS(SELECT 1 FROM media_assets a JOIN property_digitizations d ON d.id=engine_ref WHERE a.id=asset_ref AND a.version=asset_version_ref AND a.status='approved' AND a.scan_at IS NOT NULL AND a.visibility='private' AND d.state='active' AND digitization_actor_target(author_ref,d.organization_id,d.created_by,d.target_type,d.target_id,d.unit_id) AND (a.owner_id=author_ref OR EXISTS(SELECT 1 FROM digitization_evidence_grants g JOIN profiles p ON p.id=g.owner_id WHERE g.digitization_id=d.id AND g.organization_id=d.organization_id AND g.asset_id=a.id AND g.asset_version=a.version AND g.input_revision=revision_ref AND g.owner_id=a.owner_id AND g.grantee_id=author_ref AND g.state='active' AND g.expires_at>statement_timestamp() AND p.state='active' AND digitization_actor_target(g.owner_id,d.organization_id,d.created_by,d.target_type,d.target_id,d.unit_id) AND purpose_ref=ANY(g.purposes) AND g.model_review_consent AND (purpose_ref='model_review' OR g.model_publication_consent))));
$$;
REVOKE ALL ON FUNCTION digitization_model_consent_immutable() FROM PUBLIC,haven_app;
REVOKE ALL ON FUNCTION digitization_model_source_authority(uuid,uuid,uuid,integer,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION digitization_model_source_authority(uuid,uuid,uuid,integer,integer,text) TO haven_app;
CREATE OR REPLACE FUNCTION digitization_model_review_current(request_ref uuid) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM digitization_model_review_requests q JOIN property_digitizations d ON d.id=q.digitization_id JOIN property_input_revisions inputs ON inputs.digitization_id=d.id AND inputs.revision=q.input_revision
 WHERE q.id=request_ref AND d.state='active' AND d.organization_id=q.organization_id AND d.current_input_revision=q.input_revision AND d.version=q.workspace_version
 AND q.id=(SELECT latest.id FROM digitization_model_review_requests latest WHERE latest.digitization_id=d.id AND latest.model_type=q.model_type ORDER BY latest.created_at DESC,latest.id DESC LIMIT 1)
 AND q.preview_delegation_confirmed AND q.created_by<>q.reviewer_id AND digitization_current_tour_reviewer(q.reviewer_id)
 AND EXISTS(SELECT 1 FROM profiles p JOIN memberships m ON m.user_id=p.id JOIN organizations o ON o.id=m.organization_id WHERE p.id=q.created_by AND p.state='active' AND m.organization_id=q.organization_id AND m.status='active' AND m.role IN('agent','agency_manager') AND o.type='agency')
 AND digitization_actor_target(q.created_by,q.organization_id,d.created_by,d.target_type,d.target_id,d.unit_id)
 AND q.sources=inputs.source_set AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(q.sources) source LEFT JOIN media_assets a ON a.id=(source->>'assetId')::uuid WHERE a.id IS NULL OR NOT digitization_model_source_authority(q.created_by,q.digitization_id,a.id,a.version,q.input_revision,'model_review') OR a.owner_id=q.reviewer_id OR a.version IS DISTINCT FROM (source->>'assetVersion')::integer OR a.status<>'approved' OR a.scan_at IS NULL OR a.visibility<>'private' OR a.size::text IS DISTINCT FROM source->>'bytes' OR a.mime IS DISTINCT FROM source->>'detectedMime')
 AND ((q.model_type='structural' AND EXISTS(SELECT 1 FROM geometry_revisions g WHERE g.id=q.geometry_revision_id AND g.digitization_id=d.id AND g.created_by=q.created_by AND g.input_revision=q.input_revision AND g.geometry=q.geometry_snapshot AND g.scale_status IN('estimated','measured') AND g.geometry->>'unit'='m' AND g.id=(SELECT latest.id FROM geometry_revisions latest WHERE latest.digitization_id=d.id ORDER BY latest.revision DESC LIMIT 1)))
 OR (q.model_type='splat' AND EXISTS(SELECT 1 FROM artifacts ar JOIN processing_stages stage ON stage.id=ar.stage_id WHERE ar.id=q.scene_artifact_id AND ar.digitization_id=d.id AND ar.created_by=q.created_by AND ar.input_revision=q.input_revision AND ar.version=q.scene_artifact_version AND ar.checksum=q.scene_artifact_checksum AND ar.byte_size BETWEEN 32 AND 3200000 AND mod(ar.byte_size,32)=0 AND ar.status='private' AND ar.format='application/octet-stream' AND ar.quality_report->>'kind'='splat_viewer_tier' AND ar.quality_report->>'encoding'='splat32-wxyz-v1' AND stage.state='succeeded' AND stage.stage_type='scene_export'))));
$$;
CREATE OR REPLACE FUNCTION digitization_model_publication_current(proposal_ref uuid) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM digitization_model_publication_proposals p JOIN digitization_model_review_requests q ON q.id=p.model_review_request_id JOIN approval_records a ON a.id=p.approval_id JOIN property_digitizations d ON d.id=p.digitization_id JOIN listing_revisions r ON r.id=p.listing_revision_id JOIN listings l ON l.id=r.listing_id
 WHERE p.id=proposal_ref AND p.created_by=q.created_by AND p.organization_id=q.organization_id AND p.digitization_id=q.digitization_id AND p.input_revision=q.input_revision AND p.workspace_version=q.workspace_version AND p.publication_consent_confirmed AND digitization_model_review_current(q.id) AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(q.sources) source WHERE NOT digitization_model_source_authority(q.created_by,q.digitization_id,(source->>'assetId')::uuid,(source->>'assetVersion')::integer,q.input_revision,'model_publication'))
 AND a.digitization_id=q.digitization_id AND a.input_revision=q.input_revision AND a.created_by=q.reviewer_id AND a.decision='approved' AND a.snapshot->>'kind'='reviewed_model' AND a.snapshot->>'modelReviewRequestId'=q.id::text AND a.snapshot->>'candidateChecksum'=q.candidate_checksum AND a.snapshot->'privacyConfirmed'='true'::jsonb AND a.snapshot->'limitationsConfirmed'='true'::jsonb
 AND NOT EXISTS(SELECT 1 FROM digitization_approval_invalidations i WHERE i.approval_id=a.id AND i.input_revision<=p.input_revision)
 AND d.target_type='listing' AND d.target_id=l.id AND d.listing_id=l.id AND r.actor_id=p.created_by AND r.changes->'digitizationPackage'->>'approvalId'=a.id::text AND r.changes->'digitizationPackage'->>'engineId'=d.id::text AND NOT(r.changes?'unitFacts')
 AND r.status='pending' AND l.status='published' AND l.version=r.base_version)
$$;
CREATE OR REPLACE FUNCTION digitization_public_model(listing_ref uuid,package_ref uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE pkg published_packages;p digitization_model_publication_proposals;q digitization_model_review_requests;roles text[];
BEGIN
 SELECT * INTO pkg FROM published_packages WHERE listing_id=listing_ref ORDER BY publication_number DESC LIMIT 1;
 IF pkg.id IS NULL OR pkg.manifest->>'viewerType' NOT IN('structural','splat') OR (package_ref IS NOT NULL AND package_ref<>pkg.id) OR EXISTS(SELECT 1 FROM digitization_package_revocations WHERE package_id=pkg.id) OR NOT EXISTS(SELECT 1 FROM public_listings WHERE id=listing_ref) THEN RETURN NULL;END IF;
 SELECT * INTO p FROM digitization_model_publication_proposals WHERE listing_revision_id=pkg.listing_revision_id;SELECT * INTO q FROM digitization_model_review_requests WHERE id=p.model_review_request_id;
 IF p.id IS NULL OR q.id IS NULL OR NOT p.publication_consent_confirmed OR NOT EXISTS(SELECT 1 FROM property_digitizations WHERE id=p.digitization_id AND state='active') OR NOT digitization_actor_target(p.created_by,p.organization_id,p.created_by,'listing',listing_ref,(SELECT unit_id FROM listings WHERE id=listing_ref)) OR NOT EXISTS(SELECT 1 FROM profiles pr JOIN memberships m ON m.user_id=pr.id JOIN organizations o ON o.id=m.organization_id WHERE pr.id=p.created_by AND pr.state='active' AND m.organization_id=p.organization_id AND m.status='active' AND m.role IN('agent','agency_manager') AND o.type='agency') THEN RETURN NULL;END IF;
 IF NOT EXISTS(SELECT 1 FROM approval_records pa JOIN approval_records a ON a.id=p.approval_id WHERE pa.id=pkg.approval_id AND pa.scope='package' AND pa.decision='approved' AND pa.snapshot->>'modelProposalId'=p.id::text AND pa.snapshot->>'candidateChecksum'=q.candidate_checksum AND a.decision='approved' AND a.snapshot->>'modelReviewRequestId'=q.id::text AND a.snapshot->'privacyConfirmed'='true'::jsonb AND a.snapshot->'limitationsConfirmed'='true'::jsonb AND NOT EXISTS(SELECT 1 FROM digitization_approval_invalidations i WHERE i.approval_id IN(pa.id,a.id) AND i.input_revision<=pkg.input_revision)) OR pkg.manifest<>digitization_model_manifest(q.model_type,q.candidate_checksum) THEN RETURN NULL;END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(q.sources) source LEFT JOIN media_assets a ON a.id=(source->>'assetId')::uuid WHERE a.id IS NULL OR NOT digitization_model_source_authority(p.created_by,p.digitization_id,a.id,a.version,p.input_revision,'model_publication') OR a.status<>'approved' OR a.visibility<>'private' OR a.scan_at IS NULL OR a.version IS DISTINCT FROM (source->>'assetVersion')::integer OR a.size::text IS DISTINCT FROM source->>'bytes' OR a.mime IS DISTINCT FROM source->>'detectedMime') THEN RETURN NULL;END IF;
 IF q.model_type='splat' AND NOT EXISTS(SELECT 1 FROM artifacts ar JOIN processing_stages stage ON stage.id=ar.stage_id WHERE ar.id=q.scene_artifact_id AND ar.digitization_id=p.digitization_id AND ar.input_revision=p.input_revision AND ar.version=q.scene_artifact_version AND ar.checksum=q.scene_artifact_checksum AND ar.status='private' AND ar.format='application/octet-stream' AND stage.state='succeeded' AND stage.stage_type='scene_export') THEN RETURN NULL;END IF;
 SELECT array_agg(DISTINCT role) INTO roles FROM memberships WHERE user_id=p.created_by AND organization_id=p.organization_id AND status='active' AND role IN('agent','agency_manager');
 RETURN jsonb_build_object('packageId',pkg.id,'version',pkg.version,'publicationNumber',pkg.publication_number,'manifest',pkg.manifest,'engineId',pkg.digitization_id,'inputRevision',pkg.input_revision,'request',to_jsonb(q),'author',jsonb_build_object('id',p.created_by,'orgId',p.organization_id,'roles',to_jsonb(roles)));
END $$;

CREATE FUNCTION digitization_model_source_permission_scope(engine_ref uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE workspace property_digitizations;input property_input_revisions;
BEGIN
 SELECT * INTO workspace FROM property_digitizations WHERE id=engine_ref;
 IF workspace.id IS NULL OR workspace.state<>'active' OR workspace.target_type<>'listing' OR NOT digitization_actor_target(actor_id(),workspace.organization_id,workspace.created_by,workspace.target_type,workspace.target_id,workspace.unit_id) THEN RAISE EXCEPTION 'Current owner listing scope required' USING ERRCODE='42501';END IF;
 SELECT * INTO input FROM property_input_revisions WHERE digitization_id=workspace.id AND revision=workspace.current_input_revision;
 IF input.id IS NULL OR (NOT EXISTS(SELECT 1 FROM jsonb_array_elements(input.source_set) source JOIN media_assets a ON a.id=(source->>'assetId')::uuid WHERE a.owner_id=actor_id() AND a.purpose='document' AND a.status='approved' AND a.scan_at IS NOT NULL AND a.visibility='private' AND a.version=(source->>'assetVersion')::integer) AND NOT EXISTS(SELECT 1 FROM digitization_evidence_grants WHERE digitization_id=workspace.id AND owner_id=actor_id())) THEN RAISE EXCEPTION 'Current owned private document source required' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('digitizationId',workspace.id,'workspaceVersion',workspace.version,'inputRevision',input.revision,
 'sources',coalesce((SELECT jsonb_agg(jsonb_build_object('assetId',a.id,'assetVersion',a.version,'mime',a.mime,'purpose',source->>'purpose') ORDER BY a.id) FROM jsonb_array_elements(input.source_set) source JOIN media_assets a ON a.id=(source->>'assetId')::uuid WHERE a.owner_id=actor_id() AND a.purpose='document' AND a.visibility='private' AND a.status='approved' AND a.scan_at IS NOT NULL AND a.version=(source->>'assetVersion')::integer),'[]'),
 'recipients',coalesce((SELECT jsonb_agg(jsonb_build_object('id',candidate.id,'name',candidate.display_name) ORDER BY candidate.display_name,candidate.id) FROM (SELECT DISTINCT p.id,p.display_name FROM profiles p JOIN memberships m ON m.user_id=p.id WHERE p.state='active' AND m.organization_id=workspace.organization_id AND m.status='active' AND m.role IN('agent','agency_manager') AND digitization_actor_target(p.id,workspace.organization_id,workspace.created_by,workspace.target_type,workspace.target_id,workspace.unit_id) ORDER BY p.id LIMIT 100) candidate),'[]'),
 'grants',coalesce((SELECT jsonb_agg(jsonb_build_object('id',g.id,'assetId',g.asset_id,'granteeId',g.grantee_id,'version',g.version,'purposes',g.purposes,'state',g.state,'expiresAt',g.expires_at) ORDER BY g.created_at DESC,g.id) FROM (SELECT * FROM digitization_evidence_grants WHERE digitization_id=workspace.id AND owner_id=actor_id() ORDER BY created_at DESC,id LIMIT 1000) g),'[]'));
END $$;
REVOKE ALL ON FUNCTION digitization_model_source_permission_scope(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION digitization_model_source_permission_scope(uuid) TO haven_app;

CREATE FUNCTION digitization_model_lock_source_authority(engine_ref uuid,sources_ref jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM 1 FROM media_assets WHERE id IN(SELECT (source->>'assetId')::uuid FROM jsonb_array_elements(sources_ref) source) ORDER BY id FOR SHARE;
 PERFORM 1 FROM profiles WHERE id IN(SELECT owner_id FROM media_assets WHERE id IN(SELECT (source->>'assetId')::uuid FROM jsonb_array_elements(sources_ref) source)) ORDER BY id FOR SHARE;
 PERFORM 1 FROM owner_unit_grants WHERE unit_id=(SELECT unit_id FROM property_digitizations WHERE id=engine_ref) ORDER BY id FOR SHARE;
 PERFORM 1 FROM digitization_evidence_grants WHERE digitization_id=engine_ref AND asset_id IN(SELECT (source->>'assetId')::uuid FROM jsonb_array_elements(sources_ref) source) ORDER BY id FOR SHARE;
END $$;
REVOKE ALL ON FUNCTION digitization_model_lock_source_authority(uuid,jsonb) FROM PUBLIC,haven_app;

CREATE OR REPLACE FUNCTION digitization_review_model(request_ref uuid,request_version integer,engine_version integer,decision_ref text,privacy_confirmed boolean,limitations_confirmed boolean,reason_ref text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE q digitization_model_review_requests;approval approval_records;
BEGIN
 SELECT * INTO q FROM digitization_model_review_requests WHERE id=request_ref;
 IF q.id IS NULL OR q.reviewer_id<>actor_id() OR q.created_by=actor_id() OR NOT digitization_current_tour_reviewer(actor_id()) THEN RAISE EXCEPTION 'Independent assigned model reviewer required' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM property_digitizations WHERE id=q.digitization_id FOR UPDATE;
 PERFORM 1 FROM listings WHERE id=(SELECT listing_id FROM property_digitizations WHERE id=q.digitization_id) FOR SHARE;
 PERFORM 1 FROM listing_mandates WHERE unit_id=(SELECT unit_id FROM property_digitizations WHERE id=q.digitization_id) AND organization_id=q.organization_id FOR SHARE;
 PERFORM 1 FROM profiles WHERE id IN(q.created_by,actor_id()) FOR SHARE;
 PERFORM 1 FROM memberships WHERE user_id IN(q.created_by,actor_id()) FOR SHARE;
 PERFORM 1 FROM media_assets WHERE id IN(SELECT (source->>'assetId')::uuid FROM jsonb_array_elements(q.sources) source) FOR SHARE;
 PERFORM digitization_model_lock_source_authority(q.digitization_id,q.sources);
 IF q.geometry_revision_id IS NOT NULL THEN PERFORM 1 FROM geometry_revisions WHERE id=q.geometry_revision_id FOR SHARE;END IF;
 IF q.scene_artifact_id IS NOT NULL THEN PERFORM 1 FROM artifacts WHERE id=q.scene_artifact_id FOR SHARE;END IF;
 IF request_version IS DISTINCT FROM 1 OR engine_version IS DISTINCT FROM q.workspace_version OR NOT digitization_model_review_current(q.id) OR EXISTS(SELECT 1 FROM approval_records a WHERE a.snapshot->>'modelReviewRequestId'=q.id::text) THEN RAISE EXCEPTION 'Current pending model review required' USING ERRCODE='40001';END IF;
 IF decision_ref IS NULL OR reason_ref IS NULL OR decision_ref NOT IN('approved','rejected') OR length(trim(reason_ref)) NOT BETWEEN 5 AND 1000 OR(decision_ref='approved' AND(privacy_confirmed IS DISTINCT FROM true OR limitations_confirmed IS DISTINCT FROM true)) THEN RAISE EXCEPTION 'Explicit privacy and visualization limitations review required' USING ERRCODE='23514';END IF;
 INSERT INTO approval_records(digitization_id,organization_id,created_by,input_revision,scope,snapshot,decision,reason) VALUES(q.digitization_id,q.organization_id,actor_id(),q.input_revision,CASE WHEN q.model_type='structural' THEN 'geometry' ELSE 'artifact' END,jsonb_build_object('kind','reviewed_model','modelReviewRequestId',q.id,'modelType',q.model_type,'candidateChecksum',q.candidate_checksum,'processingProfile',q.processing_profile,'privacyConfirmed',coalesce(privacy_confirmed,false),'limitationsConfirmed',coalesce(limitations_confirmed,false),'metricMeasurementsAvailable',false,'publiclyServed',false),decision_ref,trim(reason_ref)) RETURNING * INTO approval;
 RETURN to_jsonb(approval);
END $$;

CREATE OR REPLACE FUNCTION digitization_model_publication_review_context(revision_ref uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
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
 PERFORM digitization_model_lock_source_authority(q.digitization_id,q.sources);
 IF q.geometry_revision_id IS NOT NULL THEN PERFORM 1 FROM geometry_revisions WHERE id=q.geometry_revision_id FOR SHARE;END IF;
 IF q.scene_artifact_id IS NOT NULL THEN PERFORM 1 FROM artifacts WHERE id=q.scene_artifact_id FOR SHARE;END IF;
 IF NOT digitization_model_publication_current(p.id) THEN RAISE EXCEPTION 'Model publication dependencies changed' USING ERRCODE='40001';END IF;
 RETURN digitization_model_review_context(q.id);
END $$;

CREATE OR REPLACE FUNCTION digitization_commit_model_publication(revision_ref uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p digitization_model_publication_proposals;q digitization_model_review_requests;r listing_revisions;l listings;a approval_records;pa approval_records;pkg published_packages;
BEGIN
 SELECT * INTO p FROM digitization_model_publication_proposals WHERE listing_revision_id=revision_ref;IF p.id IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO q FROM digitization_model_review_requests WHERE id=p.model_review_request_id;
 PERFORM digitization_model_lock_source_authority(q.digitization_id,q.sources);
 SELECT * INTO r FROM listing_revisions WHERE id=revision_ref;SELECT * INTO l FROM listings WHERE id=r.listing_id;
 IF q.reviewer_id<>actor_id() OR p.created_by=actor_id() OR NOT digitization_current_tour_reviewer(actor_id()) OR r.status<>'approved' OR r.reviewed_by<>actor_id() OR l.version<>r.base_version+1 OR l.status<>'published' OR NOT digitization_model_review_current(q.id) OR EXISTS(SELECT 1 FROM jsonb_array_elements(q.sources) source WHERE NOT digitization_model_source_authority(q.created_by,q.digitization_id,(source->>'assetId')::uuid,(source->>'assetVersion')::integer,q.input_revision,'model_publication')) THEN RAISE EXCEPTION 'Current independent inventory model decision required' USING ERRCODE='42501';END IF;
 SELECT * INTO a FROM approval_records WHERE id=p.approval_id AND decision='approved' AND snapshot->>'modelReviewRequestId'=q.id::text;
 IF a.id IS NULL OR EXISTS(SELECT 1 FROM digitization_approval_invalidations WHERE approval_id=a.id AND input_revision<=p.input_revision) THEN RAISE EXCEPTION 'Model approval changed' USING ERRCODE='40001';END IF;
 INSERT INTO approval_records(digitization_id,organization_id,created_by,input_revision,scope,snapshot,decision,reason) VALUES(p.digitization_id,p.organization_id,actor_id(),p.input_revision,'package',jsonb_build_object('kind','reviewed_inventory_model_package','modelProposalId',p.id,'modelApprovalId',a.id,'candidateChecksum',q.candidate_checksum,'listingRevisionId',r.id),'approved',r.review_reason) RETURNING * INTO pa;
 INSERT INTO published_packages(digitization_id,organization_id,created_by,listing_id,listing_version,input_revision,approval_id,manifest,publication_number,listing_revision_id) VALUES(p.digitization_id,p.organization_id,actor_id(),l.id,l.version,p.input_revision,pa.id,digitization_model_manifest(q.model_type,q.candidate_checksum),(SELECT coalesce(max(publication_number),0)+1 FROM published_packages WHERE listing_id=l.id),r.id) RETURNING * INTO pkg;
 RETURN pkg.id;
END $$;

CREATE OR REPLACE FUNCTION digitization_model_request_final_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM digitization_model_lock_source_authority(NEW.digitization_id,NEW.sources);
 IF NOT digitization_model_review_current(NEW.id) THEN RAISE EXCEPTION 'Exact current consented model and independent preview delegation required' USING ERRCODE='40001';END IF;RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION digitization_model_proposal_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP<>'INSERT' OR NEW.created_by<>actor_id() OR NEW.organization_id<>org_id() THEN RAISE EXCEPTION 'Immutable model publication author required' USING ERRCODE='42501';END IF;
 PERFORM digitization_model_lock_source_authority(NEW.digitization_id,(SELECT sources FROM digitization_model_review_requests WHERE id=NEW.model_review_request_id));
 IF NOT digitization_model_publication_current(NEW.id) THEN RAISE EXCEPTION 'Current reviewed model and pending listing revision required' USING ERRCODE='40001';END IF;RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION digitization_package_freshness_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.manifest->>'viewerType' IN('structural','splat') THEN
  IF NEW.listing_revision_id IS NULL OR NOT EXISTS(SELECT 1 FROM approval_records pa JOIN digitization_model_publication_proposals p ON p.id::text=pa.snapshot->>'modelProposalId' JOIN digitization_model_review_requests q ON q.id=p.model_review_request_id JOIN approval_records a ON a.id=p.approval_id JOIN listing_revisions r ON r.id=p.listing_revision_id JOIN listings l ON l.id=r.listing_id
   WHERE pa.id=NEW.approval_id AND pa.scope='package' AND pa.decision='approved' AND pa.created_by=actor_id() AND pa.snapshot->>'kind'='reviewed_inventory_model_package' AND pa.snapshot->>'candidateChecksum'=q.candidate_checksum AND pa.snapshot->>'modelApprovalId'=a.id::text AND pa.snapshot->>'listingRevisionId'=r.id::text AND a.decision='approved' AND a.snapshot->>'modelReviewRequestId'=q.id::text
   AND q.reviewer_id=actor_id() AND q.created_by<>actor_id() AND digitization_current_tour_reviewer(actor_id()) AND digitization_model_review_current(q.id) AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(q.sources) source WHERE NOT digitization_model_source_authority(q.created_by,q.digitization_id,(source->>'assetId')::uuid,(source->>'assetVersion')::integer,q.input_revision,'model_publication')) AND p.listing_revision_id=NEW.listing_revision_id AND p.digitization_id=NEW.digitization_id AND p.input_revision=NEW.input_revision AND r.status='approved' AND r.reviewed_by=actor_id() AND l.status='published' AND l.version=NEW.listing_version AND l.version=r.base_version+1
   AND NEW.manifest=digitization_model_manifest(q.model_type,q.candidate_checksum)) THEN RAISE EXCEPTION 'Reviewed exact inventory model package required' USING ERRCODE='42501';END IF;
 ELSE
  IF NEW.listing_revision_id IS NULL OR NOT EXISTS(SELECT 1 FROM approval_records a JOIN digitization_publication_proposals p ON p.id::text=a.snapshot->>'proposalId' JOIN listing_revisions r ON r.id=p.listing_revision_id JOIN listings l ON l.id=r.listing_id
   WHERE a.id=NEW.approval_id AND a.scope='package' AND a.decision='approved' AND a.created_by=actor_id() AND p.listing_revision_id=NEW.listing_revision_id AND p.digitization_id=NEW.digitization_id AND p.input_revision=NEW.input_revision AND r.status='approved' AND r.reviewed_by=actor_id() AND l.status='published' AND l.version=NEW.listing_version AND l.version=r.base_version+1) THEN RAISE EXCEPTION 'Reviewed current inventory package required' USING ERRCODE='42501';END IF;
 END IF;RETURN NEW;
END $$;
