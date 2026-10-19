-- Preserve the actual agency author roles when assigned reviewers verify bytes.
CREATE OR REPLACE FUNCTION digitization_model_review_context(request_ref uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE q digitization_model_review_requests;approval approval_records;
BEGIN
 SELECT * INTO q FROM digitization_model_review_requests WHERE id=request_ref;
 IF q.id IS NULL OR NOT((q.created_by=actor_id() AND digitization_private_access(q.digitization_id)) OR (q.reviewer_id=actor_id() AND digitization_current_tour_reviewer(actor_id()))) THEN RAISE EXCEPTION 'Assigned model review required' USING ERRCODE='42501';END IF;
 IF NOT digitization_model_review_current(q.id) THEN RAISE EXCEPTION 'Model review dependencies changed' USING ERRCODE='40001';END IF;
 SELECT * INTO approval FROM approval_records a WHERE a.snapshot->>'modelReviewRequestId'=q.id::text;
 RETURN jsonb_build_object('request',to_jsonb(q),'approval',CASE WHEN approval.id IS NULL THEN NULL ELSE to_jsonb(approval) END,'author',jsonb_build_object('id',q.created_by,'orgId',q.organization_id,'roles',coalesce((SELECT jsonb_agg(role ORDER BY role) FROM (SELECT DISTINCT role FROM memberships WHERE user_id=q.created_by AND organization_id=q.organization_id AND status='active' AND role IN('agent','agency_manager')) role_scope),'[]'::jsonb)));
END $$;
