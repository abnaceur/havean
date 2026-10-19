-- Narrow author-owned panorama preview delegation; approvals reuse approval_records.
CREATE FUNCTION digitization_panorama_fingerprint(engine_ref uuid,organization_ref uuid,input_ref int,source jsonb) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT encode(sha256(convert_to(regexp_replace(json_build_object('version',1,'engine',engine_ref::text,'organizationId',organization_ref::text,'inputRevision',input_ref,'profileId','private-panorama-candidate-v1','source',json_build_object('assetId',source->>'assetId','assetVersion',(source->>'assetVersion')::int,'purpose',source->>'purpose','sha256',source->>'sha256','bytes',source->>'bytes','detectedMime',source->>'detectedMime','decoderState',source->>'decoderState'))::text,'[[:space:]]','','g'),'UTF8')),'hex')
$$;
CREATE FUNCTION digitization_current_tour_reviewer(reviewer_ref uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM profiles p JOIN memberships m ON m.user_id=p.id WHERE p.id=reviewer_ref AND p.state='active' AND m.status='active' AND m.role IN('moderator','admin'))
$$;
CREATE TABLE digitization_tour_review_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),digitization_id uuid NOT NULL REFERENCES property_digitizations,organization_id uuid NOT NULL REFERENCES organizations,created_by uuid NOT NULL REFERENCES profiles,reviewer_id uuid NOT NULL REFERENCES profiles,
 version int NOT NULL DEFAULT 1 CHECK(version=1),input_revision int NOT NULL,workspace_version int NOT NULL CHECK(workspace_version>0),tour_revision_id uuid NOT NULL,included_node_ids uuid[] NOT NULL CHECK(cardinality(included_node_ids) BETWEEN 1 AND 100),entry_node_id uuid NOT NULL,sources jsonb NOT NULL CHECK(jsonb_typeof(sources)='array' AND jsonb_array_length(sources) BETWEEN 1 AND 100),preview_delegation_confirmed boolean NOT NULL CHECK(preview_delegation_confirmed),created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(created_by<>reviewer_id),FOREIGN KEY(digitization_id,input_revision) REFERENCES property_input_revisions(digitization_id,revision),FOREIGN KEY(tour_revision_id,digitization_id) REFERENCES tour_revisions(id,digitization_id)
);
CREATE FUNCTION digitization_tour_review_current(request_ref uuid) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM digitization_tour_review_requests q JOIN property_digitizations d ON d.id=q.digitization_id JOIN tour_revisions t ON t.id=q.tour_revision_id JOIN property_input_revisions r ON r.digitization_id=q.digitization_id AND r.revision=q.input_revision
 WHERE q.id=request_ref AND d.state='active' AND d.organization_id=q.organization_id AND d.current_input_revision=q.input_revision AND d.version=q.workspace_version AND t.created_by=q.created_by AND t.input_revision=q.input_revision
 AND t.id=(SELECT latest.id FROM tour_revisions latest WHERE latest.digitization_id=d.id ORDER BY latest.revision DESC LIMIT 1)
 AND digitization_current_tour_reviewer(q.reviewer_id) AND EXISTS(SELECT 1 FROM profiles p JOIN memberships m ON m.user_id=p.id JOIN organizations o ON o.id=m.organization_id WHERE p.id=q.created_by AND p.state='active' AND m.organization_id=q.organization_id AND m.status='active' AND m.role IN('agent','agency_manager') AND o.type='agency')
 AND digitization_actor_target(q.created_by,q.organization_id,d.created_by,d.target_type,d.target_id,d.unit_id)
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(q.sources) source LEFT JOIN media_assets a ON a.id=(source->>'assetId')::uuid WHERE source->>'purpose'<>'panorama' OR NOT(r.source_set @> jsonb_build_array(source)) OR a.id IS NULL OR a.owner_id<>q.created_by OR a.owner_id=q.reviewer_id OR a.version<>(source->>'assetVersion')::int OR a.status<>'approved' OR a.scan_at IS NULL OR a.visibility<>'private' OR a.size::text IS DISTINCT FROM source->>'bytes' OR a.mime IS DISTINCT FROM source->>'detectedMime')
 AND q.entry_node_id=ANY(q.included_node_ids) AND cardinality(q.included_node_ids)=(SELECT count(DISTINCT id) FROM unnest(q.included_node_ids) id)
 AND NOT EXISTS(SELECT 1 FROM unnest(q.included_node_ids) included WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(t.graph->'nodes') node WHERE (node->>'id')::uuid=included))
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(t.graph->'nodes') node CROSS JOIN LATERAL jsonb_array_elements_text(node->'tierArtifactIds') tier LEFT JOIN artifacts a ON a.id=tier::uuid LEFT JOIN processing_stages stage ON stage.id=a.stage_id LEFT JOIN processing_runs run ON run.id=stage.run_id
 WHERE (node->>'id')::uuid=ANY(q.included_node_ids) AND (a.id IS NULL OR a.digitization_id<>d.id OR a.input_revision<>q.input_revision OR a.profile_id<>'private-panorama-candidate-v1' OR a.status<>'private' OR a.privacy_status NOT IN('pending','passed') OR a.format<>'image/png' OR stage.state<>'succeeded' OR run.state NOT IN('awaiting_review','awaiting_input','failed','partially_ready') OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(q.sources) source WHERE a.input_fingerprint=digitization_panorama_fingerprint(d.id,q.organization_id,q.input_revision,source)))))
$$;
CREATE FUNCTION digitization_tour_request_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Tour review requests are immutable' USING ERRCODE='23514';END IF;
 PERFORM 1 FROM property_digitizations WHERE id=NEW.digitization_id FOR UPDATE;
 IF NEW.created_by<>actor_id() OR NEW.organization_id<>org_id() OR NOT digitization_revision_access(NEW.digitization_id,NEW.input_revision,'document_processing') THEN RAISE EXCEPTION 'Current author source scope required' USING ERRCODE='42501';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tour_request_guard BEFORE INSERT OR UPDATE OR DELETE ON digitization_tour_review_requests FOR EACH ROW EXECUTE FUNCTION digitization_tour_request_guard();
CREATE FUNCTION digitization_tour_request_final_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT digitization_tour_review_current(NEW.id) THEN RAISE EXCEPTION 'Current exact author-owned panorama review scope required' USING ERRCODE='23514';END IF;RETURN NEW;
END $$;
CREATE TRIGGER tour_request_final_guard AFTER INSERT ON digitization_tour_review_requests FOR EACH ROW EXECUTE FUNCTION digitization_tour_request_final_guard();
ALTER TABLE digitization_tour_review_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY tour_request_read ON digitization_tour_review_requests FOR SELECT USING((created_by=actor_id() AND digitization_revision_access(digitization_id,input_revision,'preview')) OR (reviewer_id=actor_id() AND digitization_current_tour_reviewer(actor_id())));
CREATE POLICY tour_request_create ON digitization_tour_review_requests FOR INSERT WITH CHECK(created_by=actor_id() AND organization_id=org_id() AND digitization_revision_access(digitization_id,input_revision,'document_processing'));
CREATE FUNCTION digitization_tour_review_context(request_ref uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE q digitization_tour_review_requests;author_roles text[];
BEGIN
 SELECT * INTO q FROM digitization_tour_review_requests WHERE id=request_ref;
 IF q.id IS NULL OR NOT((q.created_by=actor_id() AND digitization_revision_access(q.digitization_id,q.input_revision,'preview')) OR(q.reviewer_id=actor_id() AND digitization_current_tour_reviewer(actor_id()))) THEN RAISE EXCEPTION 'Assigned current tour review scope required' USING ERRCODE='42501';END IF;
 IF NOT digitization_tour_review_current(q.id) THEN RAISE EXCEPTION 'Tour review scope changed' USING ERRCODE='40001';END IF;
 SELECT array_agg(DISTINCT role) INTO author_roles FROM memberships WHERE user_id=q.created_by AND organization_id=q.organization_id AND status='active' AND role IN('agent','agency_manager');
 RETURN jsonb_build_object('request',to_jsonb(q),'graph',(SELECT graph FROM tour_revisions WHERE id=q.tour_revision_id),'author',jsonb_build_object('id',q.created_by,'orgId',q.organization_id,'roles',to_jsonb(author_roles)));
END $$;
CREATE FUNCTION digitization_review_tour(request_ref uuid,request_version int,engine_version int,kept uuid[],entry_ref uuid,projection_confirmed boolean,privacy_confirmed boolean,decision_ref text,reason_ref text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE q digitization_tour_review_requests;g jsonb;nodes jsonb;manifest jsonb;approval approval_records;excluded uuid[];
BEGIN
 SELECT * INTO q FROM digitization_tour_review_requests WHERE id=request_ref;
 IF q.id IS NULL OR q.reviewer_id<>actor_id() OR q.created_by=actor_id() OR NOT digitization_current_tour_reviewer(actor_id()) THEN RAISE EXCEPTION 'Independent assigned tour reviewer required' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM property_digitizations WHERE id=q.digitization_id FOR UPDATE;
 PERFORM 1 FROM listings WHERE id=(SELECT listing_id FROM property_digitizations WHERE id=q.digitization_id) FOR SHARE;PERFORM 1 FROM listing_mandates WHERE listing_id=(SELECT listing_id FROM property_digitizations WHERE id=q.digitization_id) FOR SHARE;
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

CREATE FUNCTION digitization_tour_review_result(request_ref uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM digitization_tour_review_context(request_ref);
 RETURN (SELECT to_jsonb(a) FROM approval_records a WHERE a.snapshot->>'tourReviewRequestId'=request_ref::text ORDER BY a.created_at DESC,a.id DESC LIMIT 1);
END $$;
