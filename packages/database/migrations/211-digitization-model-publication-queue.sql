CREATE FUNCTION digitization_model_publication_review_queue() RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(item ORDER BY created_at DESC),'[]'::jsonb) FROM(
  SELECT p.created_at,jsonb_build_object('revisionId',r.id,'revisionVersion',r.version,'listingTitle',l.title,'reviewRequestId',q.id,'modelType',q.model_type,'candidateChecksum',q.candidate_checksum) item
  FROM digitization_model_publication_proposals p JOIN digitization_model_review_requests q ON q.id=p.model_review_request_id JOIN listing_revisions r ON r.id=p.listing_revision_id JOIN listings l ON l.id=r.listing_id
  WHERE q.reviewer_id=actor_id() AND p.created_by<>actor_id() AND digitization_current_tour_reviewer(actor_id()) AND digitization_model_publication_current(p.id) ORDER BY p.created_at DESC LIMIT 100
 ) selected
$$;
REVOKE ALL ON FUNCTION digitization_model_publication_review_queue() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION digitization_model_publication_review_queue() TO haven_app;
