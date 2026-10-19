-- A delegated registration is another immutable registration snapshot, not a
-- public scene approval. Reuse the existing independently audited approval ledger.
CREATE FUNCTION digitization_registration_review_current(review_ref uuid,creating boolean DEFAULT false) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE q digitization_scene_registrations;
BEGIN
 SELECT * INTO q FROM digitization_scene_registrations WHERE id=review_ref;
 IF q.id IS NULL OR q.registration->'reviewRequest' IS DISTINCT FROM 'true'::jsonb THEN RETURN false;END IF;
 RETURN EXISTS(SELECT 1 FROM property_digitizations d JOIN property_input_revisions inputs ON inputs.digitization_id=d.id AND inputs.revision=q.input_revision JOIN artifacts ar ON ar.id=q.scene_artifact_id JOIN processing_stages stage ON stage.id=ar.stage_id JOIN geometry_revisions g ON g.id=q.geometry_revision_id
 WHERE d.id=q.digitization_id AND d.state='active' AND d.organization_id=q.organization_id AND d.current_input_revision=q.input_revision AND d.version=q.workspace_version+CASE WHEN creating THEN 0 ELSE 1 END
 AND g.id=(SELECT id FROM geometry_revisions WHERE digitization_id=d.id ORDER BY revision DESC LIMIT 1) AND g.input_revision=q.input_revision
 AND ar.digitization_id=d.id AND ar.input_revision=q.input_revision AND ar.status='private' AND ar.format='application/octet-stream' AND ar.quality_report->>'kind'='splat_viewer_tier' AND ar.quality_report->>'encoding'='splat32-wxyz-v1' AND stage.state='succeeded' AND stage.stage_type='scene_export'
 AND ar.version IS NOT DISTINCT FROM (q.registration->>'sceneArtifactVersion')::integer AND ar.checksum IS NOT DISTINCT FROM q.registration->>'sceneArtifactChecksum'
 AND q.registration->'previewDelegationConfirmed'='true'::jsonb AND q.created_by IS DISTINCT FROM (q.registration->>'reviewerId')::uuid AND digitization_current_tour_reviewer((q.registration->>'reviewerId')::uuid)
 AND EXISTS(SELECT 1 FROM profiles p JOIN memberships m ON m.user_id=p.id JOIN organizations o ON o.id=m.organization_id WHERE p.id=q.created_by AND p.state='active' AND m.organization_id=q.organization_id AND m.status='active' AND m.role IN('agent','agency_manager') AND o.type='agency')
 AND digitization_actor_target(q.created_by,q.organization_id,d.created_by,d.target_type,d.target_id,d.unit_id)
 AND jsonb_array_length(inputs.source_set)>0 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(inputs.source_set) source LEFT JOIN media_assets a ON a.id=(source->>'assetId')::uuid WHERE a.id IS NULL OR a.owner_id<>q.created_by OR a.version IS DISTINCT FROM (source->>'assetVersion')::integer OR a.status<>'approved' OR a.scan_at IS NULL OR a.visibility<>'private' OR a.size::text IS DISTINCT FROM source->>'bytes' OR a.mime IS DISTINCT FROM source->>'detectedMime')
 AND NOT EXISTS(SELECT 1 FROM digitization_scene_registrations newer WHERE newer.digitization_id=d.id AND newer.workspace_version>q.workspace_version));
END $$;
CREATE FUNCTION digitization_registration_review_request_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE original digitization_scene_registrations;artifact artifacts;
BEGIN
 IF NEW.registration->'reviewRequest' IS DISTINCT FROM 'true'::jsonb THEN RETURN NEW;END IF;
 SELECT * INTO original FROM digitization_scene_registrations WHERE id=(NEW.registration->>'observationRegistrationId')::uuid;
 SELECT * INTO artifact FROM artifacts WHERE id=NEW.scene_artifact_id;
 IF original.id IS NULL OR original.created_by<>actor_id() OR original.digitization_id<>NEW.digitization_id OR original.input_revision<>NEW.input_revision OR original.scene_artifact_id<>NEW.scene_artifact_id OR original.geometry_revision_id<>NEW.geometry_revision_id OR original.floor_id<>NEW.floor_id OR original.anchors IS DISTINCT FROM NEW.anchors OR original.metres_per_scene_unit<>NEW.metres_per_scene_unit OR original.registration->'reviewRequest'='true'::jsonb OR original.registration->'sceneToPlan' IS DISTINCT FROM NEW.registration->'sceneToPlan' OR original.registration->'cameraAnchors' IS DISTINCT FROM NEW.registration->'cameraAnchors' OR artifact.version IS DISTINCT FROM (NEW.registration->>'sceneArtifactVersion')::integer OR artifact.checksum IS DISTINCT FROM NEW.registration->>'sceneArtifactChecksum' OR NEW.registration->'previewDelegationConfirmed' IS DISTINCT FROM 'true'::jsonb OR NEW.created_by=(NEW.registration->>'reviewerId')::uuid OR NOT digitization_current_tour_reviewer((NEW.registration->>'reviewerId')::uuid) THEN RAISE EXCEPTION 'Exact author-owned registration and independent preview delegation required' USING ERRCODE='42501';END IF;
 IF original.id IS DISTINCT FROM (SELECT id FROM digitization_scene_registrations WHERE digitization_id=NEW.digitization_id ORDER BY workspace_version DESC,id DESC LIMIT 1) THEN RAISE EXCEPTION 'Select the latest private registration observations' USING ERRCODE='40001';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER scene_registration_review_request_guard BEFORE INSERT ON digitization_scene_registrations FOR EACH ROW EXECUTE FUNCTION digitization_registration_review_request_guard();
CREATE FUNCTION digitization_registration_review_request_final_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.registration->'reviewRequest'='true'::jsonb AND NOT digitization_registration_review_current(NEW.id,true) THEN RAISE EXCEPTION 'Current exact author-owned review scope required' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER scene_registration_review_request_final_guard AFTER INSERT ON digitization_scene_registrations FOR EACH ROW EXECUTE FUNCTION digitization_registration_review_request_final_guard();
CREATE FUNCTION digitization_registration_review_context(review_ref uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE q digitization_scene_registrations;roles text[];
BEGIN
 SELECT * INTO q FROM digitization_scene_registrations WHERE id=review_ref;
 IF q.id IS NULL OR q.registration->'reviewRequest' IS DISTINCT FROM 'true'::jsonb OR NOT((q.created_by=actor_id() AND digitization_revision_access(q.digitization_id,q.input_revision,'preview')) OR((q.registration->>'reviewerId')::uuid=actor_id() AND digitization_current_tour_reviewer(actor_id()))) THEN RAISE EXCEPTION 'Assigned current registration review scope required' USING ERRCODE='42501';END IF;
 IF NOT digitization_registration_review_current(q.id) THEN RAISE EXCEPTION 'Registration review scope changed' USING ERRCODE='40001';END IF;
 SELECT array_agg(DISTINCT role) INTO roles FROM memberships WHERE user_id=q.created_by AND organization_id=q.organization_id AND status='active' AND role IN('agent','agency_manager');
 RETURN jsonb_build_object('request',to_jsonb(q),'geometry',(SELECT geometry FROM geometry_revisions WHERE id=q.geometry_revision_id),'author',jsonb_build_object('id',q.created_by,'orgId',q.organization_id,'roles',to_jsonb(roles)),'approval',(SELECT to_jsonb(a) FROM approval_records a WHERE a.snapshot->>'kind'='reviewed_scene_registration' AND a.snapshot->>'registrationReviewId'=q.id::text AND a.created_by=(q.registration->>'reviewerId')::uuid AND a.input_revision=q.input_revision ORDER BY a.created_at DESC,a.id DESC LIMIT 1));
END $$;
CREATE FUNCTION digitization_registration_approval_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE q digitization_scene_registrations;chosen text[];available text[];
BEGIN
 IF NEW.snapshot->>'kind' IS DISTINCT FROM 'reviewed_scene_registration' THEN RETURN NEW;END IF;
 SELECT * INTO q FROM digitization_scene_registrations WHERE id=(NEW.snapshot->>'registrationReviewId')::uuid;
 IF q.id IS NULL OR NEW.created_by<>actor_id() OR q.created_by=actor_id() OR (q.registration->>'reviewerId')::uuid IS DISTINCT FROM actor_id() OR NOT digitization_current_tour_reviewer(actor_id()) THEN RAISE EXCEPTION 'Independent assigned registration reviewer required' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM property_digitizations WHERE id=q.digitization_id FOR UPDATE;
 IF NOT digitization_registration_review_current(q.id) OR NEW.scope<>'artifact' OR NEW.digitization_id<>q.digitization_id OR NEW.organization_id<>q.organization_id OR NEW.input_revision<>q.input_revision OR NEW.snapshot->>'observationRegistrationId' IS DISTINCT FROM q.registration->>'observationRegistrationId' OR NEW.snapshot->>'sceneArtifactId' IS DISTINCT FROM q.scene_artifact_id::text OR NEW.snapshot->>'geometryRevisionId' IS DISTINCT FROM q.geometry_revision_id::text OR NEW.snapshot->>'floorId' IS DISTINCT FROM q.floor_id OR NEW.snapshot->'metricMeasurementsAvailable' IS DISTINCT FROM 'false'::jsonb OR NEW.snapshot->'publiclyServed' IS DISTINCT FROM 'false'::jsonb OR NEW.snapshot->'privateNavigationApproved' IS DISTINCT FROM to_jsonb(NEW.decision='approved') OR EXISTS(SELECT 1 FROM approval_records a WHERE a.snapshot->>'registrationReviewId'=q.id::text) THEN RAISE EXCEPTION 'Exact current registration approval dependencies required' USING ERRCODE='23514';END IF;
 IF jsonb_typeof(NEW.snapshot->'cameraIds') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Explicit observed camera IDs required' USING ERRCODE='23514';END IF;
 SELECT coalesce(array_agg(id),'{}'::text[]) INTO chosen FROM jsonb_array_elements_text(NEW.snapshot->'cameraIds') id;
 SELECT array_agg(camera->>'id') INTO available FROM jsonb_array_elements(q.registration->'cameraAnchors') camera;
 IF NEW.decision='approved' AND (NEW.snapshot->'transformConfirmed' IS DISTINCT FROM 'true'::jsonb OR NEW.snapshot->'cameraPositionsConfirmed' IS DISTINCT FROM 'true'::jsonb OR cardinality(chosen) NOT BETWEEN 1 AND 50 OR cardinality(chosen)<>(SELECT count(DISTINCT id) FROM unnest(chosen) id) OR NOT(chosen<@coalesce(available,'{}'::text[]))) OR NEW.decision='rejected' AND cardinality(chosen)<>0 OR NEW.decision NOT IN('approved','rejected') THEN RAISE EXCEPTION 'Verified current camera positions are required for private navigation approval' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER scene_registration_approval_guard BEFORE INSERT ON approval_records FOR EACH ROW EXECUTE FUNCTION digitization_registration_approval_guard();
CREATE FUNCTION digitization_registration_review_queue() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT digitization_current_tour_reviewer(actor_id()) THEN RAISE EXCEPTION 'Current independent reviewer required' USING ERRCODE='42501';END IF;
 RETURN coalesce((SELECT jsonb_agg(digitization_registration_review_context(id)) FROM (SELECT id FROM digitization_scene_registrations WHERE registration->'reviewRequest'='true'::jsonb AND registration->>'reviewerId'=actor_id()::text AND digitization_registration_review_current(id) ORDER BY created_at DESC,id DESC LIMIT 100) current_reviews),'[]'::jsonb);
END $$;
CREATE FUNCTION digitization_review_registration(review_ref uuid,request_version integer,engine_version integer,camera_ids text[],transform_confirmed boolean,cameras_confirmed boolean,decision_ref text,reason_ref text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE q digitization_scene_registrations;available text[];approval approval_records;
BEGIN
 SELECT * INTO q FROM digitization_scene_registrations WHERE id=review_ref;
 IF q.id IS NULL OR q.registration->'reviewRequest' IS DISTINCT FROM 'true'::jsonb OR (q.registration->>'reviewerId')::uuid IS DISTINCT FROM actor_id() OR q.created_by=actor_id() OR NOT digitization_current_tour_reviewer(actor_id()) THEN RAISE EXCEPTION 'Independent assigned registration reviewer required' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM property_digitizations WHERE id=q.digitization_id FOR UPDATE;
 PERFORM 1 FROM listings WHERE id=(SELECT listing_id FROM property_digitizations WHERE id=q.digitization_id) FOR SHARE;
 PERFORM 1 FROM listing_mandates WHERE unit_id=(SELECT unit_id FROM property_digitizations WHERE id=q.digitization_id) AND organization_id=q.organization_id FOR SHARE;
 PERFORM 1 FROM profiles WHERE id IN(q.created_by,actor_id()) FOR SHARE;
 PERFORM 1 FROM memberships WHERE user_id IN(q.created_by,actor_id()) FOR SHARE;
 PERFORM 1 FROM media_assets WHERE id IN(SELECT (source->>'assetId')::uuid FROM property_input_revisions inputs CROSS JOIN LATERAL jsonb_array_elements(inputs.source_set) source WHERE inputs.digitization_id=q.digitization_id AND inputs.revision=q.input_revision) FOR SHARE;
 PERFORM 1 FROM artifacts WHERE id=q.scene_artifact_id FOR SHARE;
 IF request_version IS DISTINCT FROM 1 OR engine_version IS DISTINCT FROM q.workspace_version+1 OR NOT digitization_registration_review_current(q.id) OR EXISTS(SELECT 1 FROM approval_records a WHERE a.snapshot->>'registrationReviewId'=q.id::text) THEN RAISE EXCEPTION 'Current pending registration review required' USING ERRCODE='40001';END IF;
 IF decision_ref IS NULL OR reason_ref IS NULL OR decision_ref NOT IN('approved','rejected') OR length(trim(reason_ref)) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'Explicit review decision and reason required' USING ERRCODE='23514';END IF;
 SELECT array_agg(camera->>'id') INTO available FROM jsonb_array_elements(q.registration->'cameraAnchors') camera;
 IF decision_ref='approved' AND (transform_confirmed IS DISTINCT FROM true OR cameras_confirmed IS DISTINCT FROM true OR camera_ids IS NULL OR cardinality(camera_ids) NOT BETWEEN 1 AND 50 OR cardinality(camera_ids)<>(SELECT count(DISTINCT id) FROM unnest(camera_ids) id) OR NOT(camera_ids<@coalesce(available,'{}'::text[]))) THEN RAISE EXCEPTION 'Verify the transform and explicitly select current observed camera positions' USING ERRCODE='23514';END IF;
 IF decision_ref='rejected' AND camera_ids IS DISTINCT FROM '{}'::text[] THEN RAISE EXCEPTION 'A rejected review cannot retain approved camera positions' USING ERRCODE='23514';END IF;
 INSERT INTO approval_records(digitization_id,organization_id,created_by,input_revision,scope,snapshot,decision,reason) VALUES(q.digitization_id,q.organization_id,actor_id(),q.input_revision,'artifact',jsonb_build_object('kind','reviewed_scene_registration','registrationReviewId',q.id,'observationRegistrationId',q.registration->>'observationRegistrationId','sceneArtifactId',q.scene_artifact_id,'geometryRevisionId',q.geometry_revision_id,'floorId',q.floor_id,'cameraIds',to_jsonb(camera_ids),'transformConfirmed',coalesce(transform_confirmed,false),'cameraPositionsConfirmed',coalesce(cameras_confirmed,false),'privateNavigationApproved',decision_ref='approved','metricMeasurementsAvailable',false,'publiclyServed',false),decision_ref,trim(reason_ref)) RETURNING * INTO approval;
 RETURN to_jsonb(approval);
END $$;
