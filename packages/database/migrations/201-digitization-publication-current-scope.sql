-- Preserve the applied publication migration; extend current source locking and
-- public eligibility through the inventory-owned public listing projection.
ALTER FUNCTION digitization_publication_review_context(uuid) RENAME TO digitization_publication_review_context_base;
REVOKE ALL ON FUNCTION digitization_publication_review_context_base(uuid) FROM PUBLIC,haven_app;
CREATE FUNCTION digitization_publication_review_context(revision_ref uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p digitization_publication_proposals;q digitization_tour_review_requests;
BEGIN
 SELECT * INTO p FROM digitization_publication_proposals WHERE listing_revision_id=revision_ref;IF p.id IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO q FROM digitization_tour_review_requests WHERE id=p.tour_review_request_id;
 IF q.reviewer_id<>actor_id() OR p.created_by=actor_id() OR NOT digitization_current_tour_reviewer(actor_id()) THEN RAISE EXCEPTION 'Independent assigned publication reviewer required' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM property_digitizations WHERE id=p.digitization_id FOR UPDATE;
 PERFORM 1 FROM listings WHERE id=(SELECT listing_id FROM listing_revisions WHERE id=revision_ref) FOR UPDATE;
 PERFORM 1 FROM listing_mandates WHERE unit_id=(SELECT unit_id FROM property_digitizations WHERE id=p.digitization_id) AND organization_id=p.organization_id FOR SHARE;
 PERFORM 1 FROM profiles WHERE id IN(p.created_by,q.reviewer_id) FOR SHARE;
 PERFORM 1 FROM memberships WHERE user_id IN(p.created_by,q.reviewer_id) FOR SHARE;
 PERFORM 1 FROM media_assets WHERE id IN(SELECT (s->>'assetId')::uuid FROM jsonb_array_elements(q.sources) s) FOR SHARE;
 PERFORM 1 FROM artifacts WHERE id IN(SELECT t::uuid FROM approval_records a CROSS JOIN LATERAL jsonb_array_elements(a.snapshot->'manifest'->'nodes') n CROSS JOIN LATERAL jsonb_array_elements_text(n->'tierArtifactIds') t WHERE a.id=p.approval_id) FOR SHARE;
 RETURN digitization_publication_review_context_base(revision_ref);
END $$;
ALTER FUNCTION digitization_public_package(uuid,uuid) RENAME TO digitization_public_package_context_base;
REVOKE ALL ON FUNCTION digitization_public_package_context_base(uuid,uuid) FROM PUBLIC,haven_app;
CREATE FUNCTION digitization_public_package(listing_ref uuid,package_ref uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN EXISTS(SELECT 1 FROM public_listings WHERE id=listing_ref) THEN digitization_public_package_context_base(listing_ref,package_ref) ELSE NULL END
$$;
CREATE FUNCTION digitization_publication_review_queue() RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(item ORDER BY created_at DESC),'[]'::jsonb) FROM (
 SELECT p.created_at,jsonb_build_object('revisionId',r.id,'revisionVersion',r.version,'listingTitle',l.title,'reviewRequestId',q.id,'nodes',(SELECT jsonb_agg(jsonb_build_object('label',n->>'label','previewUrl','/api/v1/ops/digitization-tour-reviews/'||q.id::text||'/captures/'||(n->'tierArtifactIds'->>0)||'/preview')) FROM jsonb_array_elements(a.snapshot->'manifest'->'nodes') n)) item
 FROM digitization_publication_proposals p JOIN digitization_tour_review_requests q ON q.id=p.tour_review_request_id JOIN listing_revisions r ON r.id=p.listing_revision_id JOIN listings l ON l.id=r.listing_id JOIN approval_records a ON a.id=p.approval_id
 WHERE q.reviewer_id=actor_id() AND p.created_by<>actor_id() AND digitization_current_tour_reviewer(actor_id()) AND digitization_publication_current(p.id) ORDER BY p.created_at DESC LIMIT 100
 ) selected
$$;
