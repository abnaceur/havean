-- Retain the exact delegated input descriptors for bounded byte revalidation.
CREATE OR REPLACE FUNCTION digitization_registration_review_context(review_ref uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE q digitization_scene_registrations;roles text[];
BEGIN
 SELECT * INTO q FROM digitization_scene_registrations WHERE id=review_ref;
 IF q.id IS NULL OR q.registration->'reviewRequest' IS DISTINCT FROM 'true'::jsonb OR NOT((q.created_by=actor_id() AND digitization_revision_access(q.digitization_id,q.input_revision,'preview')) OR((q.registration->>'reviewerId')::uuid=actor_id() AND digitization_current_tour_reviewer(actor_id()))) THEN RAISE EXCEPTION 'Assigned current registration review scope required' USING ERRCODE='42501';END IF;
 IF NOT digitization_registration_review_current(q.id) THEN RAISE EXCEPTION 'Registration review scope changed' USING ERRCODE='40001';END IF;
 SELECT array_agg(DISTINCT role) INTO roles FROM memberships WHERE user_id=q.created_by AND organization_id=q.organization_id AND status='active' AND role IN('agent','agency_manager');
 RETURN jsonb_build_object('request',to_jsonb(q),'sources',(SELECT source_set FROM property_input_revisions WHERE digitization_id=q.digitization_id AND revision=q.input_revision),'geometry',(SELECT geometry FROM geometry_revisions WHERE id=q.geometry_revision_id),'author',jsonb_build_object('id',q.created_by,'orgId',q.organization_id,'roles',to_jsonb(roles)),'approval',(SELECT to_jsonb(a) FROM approval_records a WHERE a.snapshot->>'kind'='reviewed_scene_registration' AND a.snapshot->>'registrationReviewId'=q.id::text AND a.created_by=(q.registration->>'reviewerId')::uuid AND a.input_revision=q.input_revision ORDER BY a.created_at DESC,a.id DESC LIMIT 1));
END $$;
