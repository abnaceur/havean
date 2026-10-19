-- Idempotent inventory decision receipts still require the current assigned
-- reviewer and exact source/model authority. They never repeat publication.
CREATE FUNCTION digitization_model_publication_receipt_context(revision_ref uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p digitization_model_publication_proposals;q digitization_model_review_requests;
BEGIN
 SELECT * INTO p FROM digitization_model_publication_proposals WHERE listing_revision_id=revision_ref;IF p.id IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO q FROM digitization_model_review_requests WHERE id=p.model_review_request_id;
 IF q.reviewer_id<>actor_id() OR q.created_by=actor_id() OR NOT digitization_current_tour_reviewer(actor_id()) THEN RAISE EXCEPTION 'Current assigned model publication receipt required' USING ERRCODE='42501';END IF;
 RETURN digitization_model_review_context(q.id);
END $$;
REVOKE ALL ON FUNCTION digitization_model_publication_receipt_context(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION digitization_model_publication_receipt_context(uuid) TO haven_app;
