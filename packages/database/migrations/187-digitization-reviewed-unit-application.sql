-- Serialize fact confirmations with input changes and inventory review.
CREATE FUNCTION digitization_fact_confirmation_lock() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM 1 FROM property_digitizations WHERE id=NEW.digitization_id FOR UPDATE;
 RETURN NEW;
END $$;
CREATE TRIGGER fact_confirmation_serialization BEFORE INSERT ON fact_decisions FOR EACH ROW EXECUTE FUNCTION digitization_fact_confirmation_lock();

CREATE OR REPLACE FUNCTION digitization_inventory_review_unit_lock(revision_ref uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE unit_ref uuid;engine_ref uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM profiles p JOIN memberships m ON m.user_id=p.id AND m.status='active' AND m.role IN('moderator','admin') WHERE p.id=actor_id() AND p.state='active') THEN RAISE EXCEPTION 'Current inventory reviewer required' USING ERRCODE='42501';END IF;
 SELECT unit.id,app.digitization_id INTO unit_ref,engine_ref FROM units unit JOIN digitization_inventory_applications app ON app.unit_id=unit.id JOIN listing_revisions revision ON revision.id=app.revision_id JOIN listings l ON l.id=revision.listing_id WHERE app.revision_id=revision_ref AND revision.status='pending' AND revision.actor_id<>actor_id() AND l.owner_id IS DISTINCT FROM actor_id() AND NOT EXISTS(SELECT 1 FROM agents agent WHERE agent.id=l.agent_id AND agent.user_id=actor_id()) FOR UPDATE OF unit;
 IF unit_ref IS NOT NULL THEN PERFORM 1 FROM property_digitizations WHERE id=engine_ref FOR UPDATE;END IF;
 RETURN unit_ref;
END $$;

CREATE FUNCTION digitization_apply_inventory_unit(revision_ref uuid,revision_version integer,verified boolean) RETURNS TABLE(listing_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE application digitization_inventory_applications;revision listing_revisions;patch jsonb;fact record;value jsonb;field_name text;mapped text[]='{}';target_unit uuid;
BEGIN
 IF verified IS DISTINCT FROM true THEN RAISE EXCEPTION 'Explicit independent verification required' USING ERRCODE='23514';END IF;
 target_unit:=digitization_inventory_review_unit_lock(revision_ref);
 IF target_unit IS NULL THEN RAISE EXCEPTION 'Independent current unit review required' USING ERRCODE='42501';END IF;
 SELECT * INTO application FROM digitization_inventory_applications WHERE revision_id=revision_ref;
 SELECT * INTO revision FROM listing_revisions WHERE id=revision_ref FOR UPDATE;
 IF revision.status<>'pending' OR revision.version<>revision_version THEN RAISE EXCEPTION 'Current revision workflow required' USING ERRCODE='40001';END IF;
 -- Hold current authority/evidence rows through commit; concurrent revocation
 -- or reassignment cannot slip between the final check and canonical writes.
 PERFORM 1 FROM profiles WHERE id IN(application.created_by,actor_id()) FOR SHARE;
 PERFORM 1 FROM memberships WHERE user_id IN(application.created_by,actor_id()) FOR SHARE;
 PERFORM 1 FROM organizations WHERE id=application.organization_id FOR SHARE;
 PERFORM 1 FROM listing_mandates WHERE unit_id=target_unit FOR SHARE;
 PERFORM 1 FROM owner_unit_grants WHERE unit_id=target_unit FOR SHARE;
 PERFORM 1 FROM agents WHERE user_id=application.created_by FOR SHARE;
 PERFORM 1 FROM media_assets asset JOIN property_input_revisions inputs ON inputs.digitization_id=application.digitization_id AND inputs.revision=application.input_revision WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(inputs.source_set) source WHERE asset.id=(source->>'assetId')::uuid) FOR SHARE OF asset;
 PERFORM 1 FROM digitization_evidence_grants WHERE digitization_id=application.digitization_id AND input_revision=application.input_revision FOR SHARE;
 IF NOT digitization_inventory_application_current(revision_ref) THEN RAISE EXCEPTION 'Unit, input, confirmation or authority changed' USING ERRCODE='40001';END IF;
 patch:=application.unit_patch;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(patch) key WHERE key NOT IN('area','areaBasis','beds','livingRooms','baths','communityId')) OR patch='{}'::jsonb THEN RAISE EXCEPTION 'Unsupported canonical unit patch' USING ERRCODE='23514';END IF;
 FOR fact IN SELECT candidate.field,candidate.candidate,decision.decision,decision.value FROM fact_decisions decision JOIN fact_candidates candidate ON candidate.id=decision.candidate_id AND candidate.digitization_id=decision.digitization_id WHERE decision.id=ANY(application.decision_ids) LOOP
  IF fact.candidate->>'origin'<>'document' THEN RAISE EXCEPTION 'Document confirmation required' USING ERRCODE='23514';END IF;
  value:=CASE WHEN fact.decision='corrected' THEN fact.value ELSE fact.candidate->'normalizedValue' END;
  field_name:=CASE fact.field WHEN 'unitArea' THEN 'area' WHEN 'bedrooms' THEN 'beds' WHEN 'livingRooms' THEN 'livingRooms' WHEN 'bathrooms' THEN 'baths' END;
  IF field_name IS NULL OR field_name=ANY(mapped) THEN RAISE EXCEPTION 'Distinct supported unit facts required' USING ERRCODE='23514';END IF;
  mapped:=array_append(mapped,field_name);
  IF field_name='area' THEN
   IF value->>'unit' IS DISTINCT FROM 'm2' OR value->>'basis' IS DISTINCT FROM 'document_unit_area' OR patch->>'areaBasis' IS DISTINCT FROM 'document_unit_area' OR patch->>'area' IS DISTINCT FROM value->>'amount' OR coalesce(value->>'amount','')!~'^\d{1,8}(\.\d{1,2})?$' OR (value->>'amount')::numeric<=0 OR (value->>'amount')::numeric>=100000 THEN RAISE EXCEPTION 'Exact confirmed decimal unit area required' USING ERRCODE='23514';END IF;
  ELSE
   IF jsonb_typeof(value) IS DISTINCT FROM 'number' OR patch->field_name IS DISTINCT FROM value OR value::text!~'^\d+$' OR value::text::integer>(CASE WHEN field_name='beds' THEN 20 ELSE 10 END) THEN RAISE EXCEPTION 'Exact supported confirmed room count required' USING ERRCODE='23514';END IF;
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(patch) key WHERE key NOT IN('communityId','areaBasis') AND NOT key=ANY(mapped)) OR (patch?'areaBasis' AND NOT patch?'area') THEN RAISE EXCEPTION 'Every proposed unit fact needs its confirmation' USING ERRCODE='23514';END IF;
 IF patch?'communityId' THEN
  PERFORM 1 FROM communities community JOIN districts district ON district.id=community.district_id JOIN cities city ON city.id=district.city_id WHERE community.id=(patch->>'communityId')::uuid FOR SHARE OF community,district,city;
  IF NOT digitization_inventory_application_current(revision_ref) THEN RAISE EXCEPTION 'Canonical geography changed' USING ERRCODE='40001';END IF;
 END IF;
 UPDATE units SET area=CASE WHEN patch?'area' THEN (patch->>'area')::numeric ELSE area END,beds=CASE WHEN patch?'beds' THEN (patch->>'beds')::integer ELSE beds END,living_rooms=CASE WHEN patch?'livingRooms' THEN (patch->>'livingRooms')::integer ELSE living_rooms END,baths=CASE WHEN patch?'baths' THEN (patch->>'baths')::integer ELSE baths END,community_id=CASE WHEN patch?'communityId' THEN (patch->>'communityId')::uuid ELSE community_id END,building_id=CASE WHEN patch?'communityId' AND community_id<>(patch->>'communityId')::uuid THEN NULL ELSE building_id END WHERE id=target_unit;
 -- Every mandate projects the same public physical-unit facts. No document,
 -- candidate, grant or private application is copied into another mandate.
 RETURN QUERY UPDATE listings SET version=version+1,updated_at=now() WHERE unit_id=target_unit AND id<>revision.listing_id RETURNING id;
END $$;
REVOKE ALL ON FUNCTION digitization_apply_inventory_unit(uuid,integer,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION digitization_apply_inventory_unit(uuid,integer,boolean) TO haven_app;
