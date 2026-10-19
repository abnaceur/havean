-- Mandates use unit/organization scope; preserve the applied191 migration.
CREATE OR REPLACE FUNCTION digitization_review_tour(request_ref uuid,request_version int,engine_version int,kept uuid[],entry_ref uuid,projection_confirmed boolean,privacy_confirmed boolean,decision_ref text,reason_ref text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE q digitization_tour_review_requests;g jsonb;nodes jsonb;manifest jsonb;approval approval_records;excluded uuid[];
BEGIN
 SELECT * INTO q FROM digitization_tour_review_requests WHERE id=request_ref;
 IF q.id IS NULL OR q.reviewer_id<>actor_id() OR q.created_by=actor_id() OR NOT digitization_current_tour_reviewer(actor_id()) THEN RAISE EXCEPTION 'Independent assigned tour reviewer required' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM property_digitizations WHERE id=q.digitization_id FOR UPDATE;
 PERFORM 1 FROM listings WHERE id=(SELECT listing_id FROM property_digitizations WHERE id=q.digitization_id) FOR SHARE;PERFORM 1 FROM listing_mandates WHERE unit_id=(SELECT unit_id FROM property_digitizations WHERE id=q.digitization_id) AND organization_id=q.organization_id FOR SHARE;
 PERFORM 1 FROM profiles WHERE id IN(q.created_by,q.reviewer_id) FOR SHARE;PERFORM 1 FROM memberships WHERE user_id IN(q.created_by,q.reviewer_id) FOR SHARE;
 PERFORM 1 FROM media_assets WHERE id IN(SELECT (source->>'assetId')::uuid FROM jsonb_array_elements(q.sources) source) FOR SHARE;
 IF q.version IS DISTINCT FROM request_version OR q.workspace_version IS DISTINCT FROM engine_version OR NOT digitization_tour_review_current(q.id) OR EXISTS(SELECT 1 FROM approval_records a WHERE a.snapshot->>'tourReviewRequestId'=q.id::text) THEN RAISE EXCEPTION 'Current pending tour review required' USING ERRCODE='40001';END IF;
 IF decision_ref IS NULL OR reason_ref IS NULL OR decision_ref NOT IN('approved','rejected') OR length(reason_ref) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'Explicit review decision and reason required' USING ERRCODE='23514';END IF;
 SELECT graph INTO g FROM tour_revisions WHERE id=q.tour_revision_id;
 IF decision_ref='approved' THEN
  IF kept IS NULL OR entry_ref IS NULL OR projection_confirmed IS DISTINCT FROM true OR privacy_confirmed IS DISTINCT FROM true OR cardinality(kept) NOT BETWEEN 1 AND 100 OR NOT(kept<@q.included_node_ids) OR cardinality(kept)<>(SELECT count(DISTINCT id) FROM unnest(kept) id) OR NOT(entry_ref=ANY(kept)) OR EXISTS(SELECT 1 FROM jsonb_array_elements(g->'nodes') node WHERE (node->>'id')::uuid=ANY(kept) AND node->>'captureDeclaration' IS DISTINCT FROM 'genuine_360_capture') THEN RAISE EXCEPTION 'Review each declared genuine panorama and select a valid approved entry' USING ERRCODE='23514';END IF;
  SELECT jsonb_agg(node||jsonb_build_object('roomId',NULL,'planPosition',NULL,'hotspots',coalesce((SELECT jsonb_agg(h) FROM jsonb_array_elements(node->'hotspots') h WHERE (h->>'targetNodeId')::uuid=ANY(kept)),'[]'::jsonb))) INTO nodes FROM jsonb_array_elements(g->'nodes') node WHERE (node->>'id')::uuid=ANY(kept);
  manifest:=jsonb_build_object('schemaVersion',1,'geometryRevisionId',NULL,'entryNodeId',entry_ref,'nodes',nodes);
 END IF;
 SELECT array_agg((node->>'id')::uuid) INTO excluded FROM jsonb_array_elements(g->'nodes') node WHERE NOT((node->>'id')::uuid=ANY(coalesce(kept,'{}'::uuid[])));
 INSERT INTO approval_records(digitization_id,organization_id,created_by,input_revision,scope,snapshot,decision,reason) VALUES(q.digitization_id,q.organization_id,actor_id(),q.input_revision,'artifact',jsonb_build_object('kind','reviewed_tour','tourReviewRequestId',q.id,'tourRevisionId',q.tour_revision_id,'manifest',manifest,'excludedNodeIds',to_jsonb(coalesce(excluded,'{}'::uuid[])),'projectionConfirmed',projection_confirmed,'privacyConfirmed',privacy_confirmed,'publiclyServed',false),decision_ref,reason_ref) RETURNING * INTO approval;
 RETURN to_jsonb(approval);
END $$;

