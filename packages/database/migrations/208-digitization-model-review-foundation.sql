-- Immutable model review snapshots. No public serving or publication permission
-- follows from a candidate checksum, declared scale or private preview consent.
CREATE TABLE digitization_model_review_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),digitization_id uuid NOT NULL REFERENCES property_digitizations,organization_id uuid NOT NULL REFERENCES organizations,created_by uuid NOT NULL REFERENCES profiles,reviewer_id uuid NOT NULL REFERENCES profiles,
 version int NOT NULL DEFAULT 1 CHECK(version=1),input_revision int NOT NULL CHECK(input_revision>0),workspace_version int NOT NULL CHECK(workspace_version>0),model_type text NOT NULL CHECK(model_type IN('structural','splat')),
 geometry_revision_id uuid,geometry_snapshot jsonb,scene_artifact_id uuid,scene_artifact_version int,scene_artifact_checksum text,
 candidate_checksum text NOT NULL CHECK(candidate_checksum~'^[a-f0-9]{64}$'),processing_profile text NOT NULL,
 sources jsonb NOT NULL CHECK(jsonb_typeof(sources)='array' AND jsonb_array_length(sources) BETWEEN 1 AND 100),preview_delegation_confirmed boolean NOT NULL CHECK(preview_delegation_confirmed),created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(created_by<>reviewer_id),CHECK((model_type='structural' AND geometry_revision_id IS NOT NULL AND geometry_snapshot IS NOT NULL AND jsonb_typeof(geometry_snapshot)='object' AND scene_artifact_id IS NULL AND scene_artifact_version IS NULL AND scene_artifact_checksum IS NULL AND processing_profile='structural-public-v1') OR (model_type='splat' AND geometry_revision_id IS NULL AND geometry_snapshot IS NULL AND scene_artifact_id IS NOT NULL AND scene_artifact_version IS NOT NULL AND scene_artifact_checksum IS NOT NULL AND scene_artifact_version>0 AND scene_artifact_checksum~'^[a-f0-9]{64}$' AND candidate_checksum=scene_artifact_checksum AND processing_profile='splat-public-v1')),
 FOREIGN KEY(digitization_id,input_revision) REFERENCES property_input_revisions(digitization_id,revision),FOREIGN KEY(geometry_revision_id,digitization_id) REFERENCES geometry_revisions(id,digitization_id),FOREIGN KEY(scene_artifact_id,digitization_id) REFERENCES artifacts(id,digitization_id),UNIQUE(id,digitization_id)
);
ALTER TABLE digitization_model_review_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY model_review_author_read ON digitization_model_review_requests FOR SELECT USING(created_by=actor_id() AND digitization_private_access(digitization_id));
CREATE POLICY model_review_author_create ON digitization_model_review_requests FOR INSERT WITH CHECK(created_by=actor_id() AND digitization_private_access(digitization_id));

CREATE FUNCTION digitization_model_review_current(request_ref uuid) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM digitization_model_review_requests q JOIN property_digitizations d ON d.id=q.digitization_id JOIN property_input_revisions inputs ON inputs.digitization_id=d.id AND inputs.revision=q.input_revision
 WHERE q.id=request_ref AND d.state='active' AND d.organization_id=q.organization_id AND d.current_input_revision=q.input_revision AND d.version=q.workspace_version
 AND q.id=(SELECT latest.id FROM digitization_model_review_requests latest WHERE latest.digitization_id=d.id AND latest.model_type=q.model_type ORDER BY latest.created_at DESC,latest.id DESC LIMIT 1)
 AND q.preview_delegation_confirmed AND q.created_by<>q.reviewer_id AND digitization_current_tour_reviewer(q.reviewer_id)
 AND EXISTS(SELECT 1 FROM profiles p JOIN memberships m ON m.user_id=p.id JOIN organizations o ON o.id=m.organization_id WHERE p.id=q.created_by AND p.state='active' AND m.organization_id=q.organization_id AND m.status='active' AND m.role IN('agent','agency_manager') AND o.type='agency')
 AND digitization_actor_target(q.created_by,q.organization_id,d.created_by,d.target_type,d.target_id,d.unit_id)
 AND q.sources=inputs.source_set AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(q.sources) source LEFT JOIN media_assets a ON a.id=(source->>'assetId')::uuid WHERE a.id IS NULL OR a.owner_id<>q.created_by OR a.owner_id=q.reviewer_id OR a.version IS DISTINCT FROM (source->>'assetVersion')::integer OR a.status<>'approved' OR a.scan_at IS NULL OR a.visibility<>'private' OR a.size::text IS DISTINCT FROM source->>'bytes' OR a.mime IS DISTINCT FROM source->>'detectedMime')
 AND ((q.model_type='structural' AND EXISTS(SELECT 1 FROM geometry_revisions g WHERE g.id=q.geometry_revision_id AND g.digitization_id=d.id AND g.created_by=q.created_by AND g.input_revision=q.input_revision AND g.geometry=q.geometry_snapshot AND g.scale_status IN('estimated','measured') AND g.geometry->>'unit'='m' AND g.id=(SELECT latest.id FROM geometry_revisions latest WHERE latest.digitization_id=d.id ORDER BY latest.revision DESC LIMIT 1)))
 OR (q.model_type='splat' AND EXISTS(SELECT 1 FROM artifacts ar JOIN processing_stages stage ON stage.id=ar.stage_id WHERE ar.id=q.scene_artifact_id AND ar.digitization_id=d.id AND ar.created_by=q.created_by AND ar.input_revision=q.input_revision AND ar.version=q.scene_artifact_version AND ar.checksum=q.scene_artifact_checksum AND ar.byte_size BETWEEN 32 AND 3200000 AND mod(ar.byte_size,32)=0 AND ar.status='private' AND ar.format='application/octet-stream' AND ar.quality_report->>'kind'='splat_viewer_tier' AND ar.quality_report->>'encoding'='splat32-wxyz-v1' AND stage.state='succeeded' AND stage.stage_type='scene_export'))));
$$;
CREATE FUNCTION digitization_model_request_final_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT digitization_model_review_current(NEW.id) THEN RAISE EXCEPTION 'Exact current owned model and independent preview delegation required' USING ERRCODE='40001';END IF;RETURN NEW;
END $$;
CREATE TRIGGER model_request_actor_guard BEFORE INSERT OR UPDATE ON digitization_model_review_requests FOR EACH ROW EXECUTE FUNCTION digitization_row_guard();
CREATE TRIGGER model_request_scope_guard AFTER INSERT ON digitization_model_review_requests FOR EACH ROW EXECUTE FUNCTION digitization_model_request_final_guard();
CREATE INDEX model_review_engine_latest ON digitization_model_review_requests(digitization_id,model_type,created_at DESC,id DESC);

CREATE FUNCTION digitization_model_review_context(request_ref uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE q digitization_model_review_requests;approval approval_records;
BEGIN
 SELECT * INTO q FROM digitization_model_review_requests WHERE id=request_ref;
 IF q.id IS NULL OR NOT((q.created_by=actor_id() AND digitization_private_access(q.digitization_id)) OR (q.reviewer_id=actor_id() AND digitization_current_tour_reviewer(actor_id()))) THEN RAISE EXCEPTION 'Assigned model review required' USING ERRCODE='42501';END IF;
 IF NOT digitization_model_review_current(q.id) THEN RAISE EXCEPTION 'Model review dependencies changed' USING ERRCODE='40001';END IF;
 SELECT * INTO approval FROM approval_records a WHERE a.snapshot->>'modelReviewRequestId'=q.id::text;
 RETURN jsonb_build_object('request',to_jsonb(q),'approval',CASE WHEN approval.id IS NULL THEN NULL ELSE to_jsonb(approval) END,'author',jsonb_build_object('id',q.created_by,'orgId',q.organization_id,'roles',jsonb_build_array('agent')));
END $$;
CREATE FUNCTION digitization_model_review_queue() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(digitization_model_review_context(q.id) ORDER BY q.created_at,q.id),'[]'::jsonb) FROM(SELECT q.* FROM digitization_model_review_requests q WHERE q.reviewer_id=actor_id() AND digitization_current_tour_reviewer(actor_id()) AND digitization_model_review_current(q.id) AND NOT EXISTS(SELECT 1 FROM approval_records a WHERE a.snapshot->>'modelReviewRequestId'=q.id::text) ORDER BY q.created_at,q.id LIMIT 100) q;
$$;
CREATE FUNCTION digitization_model_approval_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE q digitization_model_review_requests;
BEGIN
 IF NOT(NEW.snapshot?'modelReviewRequestId') THEN RETURN NEW;END IF;
 SELECT * INTO q FROM digitization_model_review_requests WHERE id=(NEW.snapshot->>'modelReviewRequestId')::uuid;
 IF q.id IS NULL OR q.reviewer_id<>actor_id() OR q.created_by=actor_id() OR NOT digitization_current_tour_reviewer(actor_id()) OR NOT digitization_model_review_current(q.id) OR NEW.created_by<>actor_id() OR NEW.digitization_id<>q.digitization_id OR NEW.organization_id<>q.organization_id OR NEW.input_revision<>q.input_revision OR NEW.scope<>(CASE WHEN q.model_type='structural' THEN 'geometry' ELSE 'artifact' END) OR NEW.decision NOT IN('approved','rejected') OR NEW.snapshot->>'kind' IS DISTINCT FROM 'reviewed_model' OR NEW.snapshot->>'modelType' IS DISTINCT FROM q.model_type OR NEW.snapshot->>'candidateChecksum' IS DISTINCT FROM q.candidate_checksum OR NEW.snapshot->>'processingProfile' IS DISTINCT FROM q.processing_profile OR NEW.snapshot->'metricMeasurementsAvailable' IS DISTINCT FROM 'false'::jsonb OR NEW.snapshot->'publiclyServed' IS DISTINCT FROM 'false'::jsonb OR (NEW.decision='approved' AND(NEW.snapshot->'privacyConfirmed' IS DISTINCT FROM 'true'::jsonb OR NEW.snapshot->'limitationsConfirmed' IS DISTINCT FROM 'true'::jsonb)) OR EXISTS(SELECT 1 FROM approval_records a WHERE a.snapshot->>'modelReviewRequestId'=q.id::text) THEN RAISE EXCEPTION 'Current independent model approval and immutable candidate required' USING ERRCODE='42501';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER model_approval_guard BEFORE INSERT ON approval_records FOR EACH ROW EXECUTE FUNCTION digitization_model_approval_guard();
CREATE UNIQUE INDEX model_approval_once ON approval_records((snapshot->>'modelReviewRequestId')) WHERE snapshot?'modelReviewRequestId';
CREATE FUNCTION digitization_review_model(request_ref uuid,request_version integer,engine_version integer,decision_ref text,privacy_confirmed boolean,limitations_confirmed boolean,reason_ref text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
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
 IF q.geometry_revision_id IS NOT NULL THEN PERFORM 1 FROM geometry_revisions WHERE id=q.geometry_revision_id FOR SHARE;END IF;
 IF q.scene_artifact_id IS NOT NULL THEN PERFORM 1 FROM artifacts WHERE id=q.scene_artifact_id FOR SHARE;END IF;
 IF request_version IS DISTINCT FROM 1 OR engine_version IS DISTINCT FROM q.workspace_version OR NOT digitization_model_review_current(q.id) OR EXISTS(SELECT 1 FROM approval_records a WHERE a.snapshot->>'modelReviewRequestId'=q.id::text) THEN RAISE EXCEPTION 'Current pending model review required' USING ERRCODE='40001';END IF;
 IF decision_ref IS NULL OR reason_ref IS NULL OR decision_ref NOT IN('approved','rejected') OR length(trim(reason_ref)) NOT BETWEEN 5 AND 1000 OR(decision_ref='approved' AND(privacy_confirmed IS DISTINCT FROM true OR limitations_confirmed IS DISTINCT FROM true)) THEN RAISE EXCEPTION 'Explicit privacy and visualization limitations review required' USING ERRCODE='23514';END IF;
 INSERT INTO approval_records(digitization_id,organization_id,created_by,input_revision,scope,snapshot,decision,reason) VALUES(q.digitization_id,q.organization_id,actor_id(),q.input_revision,CASE WHEN q.model_type='structural' THEN 'geometry' ELSE 'artifact' END,jsonb_build_object('kind','reviewed_model','modelReviewRequestId',q.id,'modelType',q.model_type,'candidateChecksum',q.candidate_checksum,'processingProfile',q.processing_profile,'privacyConfirmed',coalesce(privacy_confirmed,false),'limitationsConfirmed',coalesce(limitations_confirmed,false),'metricMeasurementsAvailable',false,'publiclyServed',false),decision_ref,trim(reason_ref)) RETURNING * INTO approval;
 RETURN to_jsonb(approval);
END $$;

CREATE TABLE digitization_model_publication_proposals(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),digitization_id uuid NOT NULL REFERENCES property_digitizations,organization_id uuid NOT NULL REFERENCES organizations,created_by uuid NOT NULL REFERENCES profiles,version int NOT NULL DEFAULT 1 CHECK(version=1),input_revision int NOT NULL CHECK(input_revision>0),workspace_version int NOT NULL CHECK(workspace_version>0),listing_revision_id uuid NOT NULL UNIQUE REFERENCES listing_revisions,model_review_request_id uuid NOT NULL,approval_id uuid NOT NULL,publication_consent_confirmed boolean NOT NULL CHECK(publication_consent_confirmed),created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(digitization_id,input_revision) REFERENCES property_input_revisions(digitization_id,revision),FOREIGN KEY(model_review_request_id,digitization_id) REFERENCES digitization_model_review_requests(id,digitization_id),FOREIGN KEY(approval_id,digitization_id) REFERENCES approval_records(id,digitization_id)
);
ALTER TABLE digitization_model_publication_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY model_publication_author_read ON digitization_model_publication_proposals FOR SELECT USING(created_by=actor_id() AND digitization_private_access(digitization_id));
-- The complete model publication port installs a guarded creation function.
-- Until then no application role can insert a proposal or infer publication.
CREATE TRIGGER model_publication_actor_guard BEFORE INSERT OR UPDATE ON digitization_model_publication_proposals FOR EACH ROW EXECUTE FUNCTION digitization_row_guard();
REVOKE ALL ON FUNCTION digitization_model_review_current(uuid),digitization_model_request_final_guard(),digitization_model_approval_guard() FROM PUBLIC,haven_app;
REVOKE ALL ON FUNCTION digitization_model_review_context(uuid),digitization_model_review_queue(),digitization_review_model(uuid,integer,integer,text,boolean,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION digitization_model_review_context(uuid),digitization_model_review_queue(),digitization_review_model(uuid,integer,integer,text,boolean,boolean,text) TO haven_app;
GRANT SELECT,INSERT ON digitization_model_review_requests TO haven_app;
GRANT SELECT ON digitization_model_publication_proposals TO haven_app;
