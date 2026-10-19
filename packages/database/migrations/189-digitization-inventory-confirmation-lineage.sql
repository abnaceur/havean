CREATE FUNCTION digitization_inventory_confirmation_lineage() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE engine property_digitizations;fact record;sources jsonb;
BEGIN
 SELECT * INTO engine FROM property_digitizations WHERE id=NEW.digitization_id;
 SELECT source_set INTO sources FROM property_input_revisions WHERE digitization_id=engine.id AND revision=NEW.input_revision;
 IF (SELECT count(DISTINCT decision.id) FROM fact_decisions decision WHERE decision.id=ANY(NEW.decision_ids) AND decision.digitization_id=engine.id)<>cardinality(NEW.decision_ids) THEN RAISE EXCEPTION 'Distinct scoped confirmations required' USING ERRCODE='23514';END IF;
 FOR fact IN SELECT candidate.*,decision.candidate_version,decision.decision FROM fact_decisions decision JOIN fact_candidates candidate ON candidate.id=decision.candidate_id AND candidate.digitization_id=decision.digitization_id WHERE decision.id=ANY(NEW.decision_ids) LOOP
  IF fact.candidate->>'origin' IS DISTINCT FROM 'document' OR fact.input_revision<>NEW.input_revision OR fact.candidate_version<>fact.version OR fact.decision NOT IN('accepted','corrected') OR fact.candidate->>'id' IS DISTINCT FROM fact.id::text OR fact.candidate->>'organizationId' IS DISTINCT FROM NEW.organization_id::text OR fact.candidate->>'field' IS DISTINCT FROM fact.field OR fact.candidate->>'extractorVersion' IS DISTINCT FROM fact.extractor_version OR (fact.candidate->>'inputRevision')::integer IS DISTINCT FROM NEW.input_revision OR (fact.candidate->>'version')::integer IS DISTINCT FROM fact.version OR fact.candidate->'target'->>'type' IS DISTINCT FROM 'listing' OR fact.candidate->'target'->>'id' IS DISTINCT FROM engine.listing_id::text OR fact.candidate->'target'->>'unitId' IS DISTINCT FROM NEW.unit_id::text OR jsonb_typeof(fact.candidate->'evidence') IS DISTINCT FROM 'array' THEN
   RAISE EXCEPTION 'Exact document and physical unit confirmation lineage required' USING ERRCODE='23514';END IF;
  IF jsonb_array_length(fact.candidate->'evidence') NOT BETWEEN 1 AND 20 OR EXISTS(SELECT 1 FROM jsonb_array_elements(fact.candidate->'evidence') evidence WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(sources) source WHERE source->>'purpose'='document' AND source->>'assetId'=evidence->>'assetId')) THEN RAISE EXCEPTION 'Each confirmation needs its current document source' USING ERRCODE='23514';END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER unit_application_lineage BEFORE INSERT ON digitization_inventory_applications FOR EACH ROW EXECUTE FUNCTION digitization_inventory_confirmation_lineage();
