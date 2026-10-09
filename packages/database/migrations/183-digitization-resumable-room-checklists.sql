ALTER TABLE capture_sessions ADD COLUMN input_revision integer NOT NULL DEFAULT 0 CHECK(input_revision>=0);
ALTER TABLE capture_sessions ADD COLUMN active_room_id text;
CREATE UNIQUE INDEX capture_session_active_actor ON capture_sessions(digitization_id,created_by) WHERE state IN('draft','recording');
CREATE FUNCTION digitization_capture_session_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE parent property_digitizations;
BEGIN
 SELECT * INTO parent FROM property_digitizations WHERE id=NEW.digitization_id FOR UPDATE;
 IF NEW.created_by<>actor_id() OR NEW.organization_id IS DISTINCT FROM org_id() OR parent.state<>'active' OR NEW.input_revision<>parent.current_input_revision OR NOT digitization_target_access(parent.id) THEN
  RAISE EXCEPTION 'Current private capture session authority required' USING ERRCODE='42501';
 END IF;
 IF TG_OP='UPDATE' AND (OLD.state NOT IN('draft','recording') OR NEW.input_revision<>OLD.input_revision OR NEW.state NOT IN('draft','recording','complete','cancelled')) THEN
  RAISE EXCEPTION 'Capture session input and workflow changed' USING ERRCODE='23514';
 END IF;
 IF jsonb_array_length(NEW.room_checklist)>200 OR jsonb_array_length(NEW.clips)>256 OR octet_length(NEW.room_checklist::text)>65536 OR octet_length(NEW.clips::text)>65536 THEN
  RAISE EXCEPTION 'Capture checklist budget exceeded' USING ERRCODE='23514';
 END IF;
 IF NEW.active_room_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.room_checklist) r WHERE r->>'id'=NEW.active_room_id) THEN
  RAISE EXCEPTION 'Select a checklist room' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.clips) clip WHERE NOT EXISTS(
  SELECT 1 FROM digitization_capture_uploads u WHERE u.id=(clip->>'uploadId')::uuid AND u.digitization_id=NEW.digitization_id AND u.created_by=actor_id() AND u.state IN('uploading','complete')) OR NOT EXISTS(
  SELECT 1 FROM jsonb_array_elements(NEW.room_checklist) room WHERE room->>'id'=clip->>'roomId')) THEN
  RAISE EXCEPTION 'Current owned room clip required' USING ERRCODE='42501';
 END IF;
 IF NEW.state='complete' AND (jsonb_array_length(NEW.room_checklist)=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.room_checklist) r WHERE r->>'completed' IS DISTINCT FROM 'true') OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.clips) clip JOIN digitization_capture_uploads u ON u.id=(clip->>'uploadId')::uuid WHERE u.state<>'complete')) THEN
  RAISE EXCEPTION 'Complete rooms and uploaded clips before closing capture' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER room_capture_guard BEFORE INSERT OR UPDATE ON capture_sessions FOR EACH ROW EXECUTE FUNCTION digitization_capture_session_guard();
DROP POLICY engine_read ON capture_sessions;
DROP POLICY engine_create ON capture_sessions;
DROP POLICY engine_update ON capture_sessions;
CREATE POLICY room_capture_read ON capture_sessions FOR SELECT USING(created_by=actor_id() AND digitization_target_access(digitization_id));
CREATE POLICY room_capture_create ON capture_sessions FOR INSERT WITH CHECK(created_by=actor_id() AND digitization_target_access(digitization_id) AND state='draft');
CREATE POLICY room_capture_update ON capture_sessions FOR UPDATE USING(created_by=actor_id() AND digitization_target_access(digitization_id)) WITH CHECK(created_by=actor_id() AND digitization_target_access(digitization_id));
