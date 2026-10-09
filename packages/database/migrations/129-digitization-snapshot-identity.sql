CREATE FUNCTION digitization_snapshot_identity_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.id<>OLD.id OR NEW.created_at<>OLD.created_at THEN RAISE EXCEPTION 'Engine identity and creation time are immutable' USING ERRCODE='23514';END IF;
  IF TG_TABLE_NAME='processing_runs' THEN
   IF NEW.input_revision<>OLD.input_revision OR NEW.desired_outputs<>OLD.desired_outputs OR NEW.budget<>OLD.budget OR NEW.deadline<>OLD.deadline THEN RAISE EXCEPTION 'Processing input and budget snapshot are immutable' USING ERRCODE='23514';END IF;
  END IF;
  IF TG_TABLE_NAME='processing_stages' THEN
   IF NEW.run_id<>OLD.run_id OR NEW.stage_type<>OLD.stage_type OR NEW.input_revision<>OLD.input_revision OR NEW.input_fingerprint<>OLD.input_fingerprint OR NEW.profile_id<>OLD.profile_id THEN RAISE EXCEPTION 'Stage input identity is immutable' USING ERRCODE='23514';END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER digitization_snapshot_identity BEFORE UPDATE ON property_digitizations FOR EACH ROW EXECUTE FUNCTION digitization_snapshot_identity_guard();
CREATE TRIGGER evidence_snapshot_identity BEFORE UPDATE ON digitization_evidence_grants FOR EACH ROW EXECUTE FUNCTION digitization_snapshot_identity_guard();
CREATE TRIGGER run_snapshot_identity BEFORE UPDATE ON processing_runs FOR EACH ROW EXECUTE FUNCTION digitization_snapshot_identity_guard();
CREATE TRIGGER stage_snapshot_identity BEFORE UPDATE ON processing_stages FOR EACH ROW EXECUTE FUNCTION digitization_snapshot_identity_guard();
CREATE TRIGGER capture_snapshot_identity BEFORE UPDATE ON capture_sessions FOR EACH ROW EXECUTE FUNCTION digitization_snapshot_identity_guard();
