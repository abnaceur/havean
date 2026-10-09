CREATE OR REPLACE FUNCTION digitization_capture_session_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE parent property_digitizations;
BEGIN
 SELECT * INTO parent FROM property_digitizations WHERE id=NEW.digitization_id FOR UPDATE;
 IF NEW.created_by<>actor_id() OR NEW.organization_id IS DISTINCT FROM org_id() OR parent.state<>'active' OR (NEW.input_revision<>parent.current_input_revision AND NEW.state<>'cancelled') OR NOT digitization_target_access(parent.id) THEN
  RAISE EXCEPTION 'Current private capture session authority required' USING ERRCODE='42501';
 END IF;
 IF TG_OP='UPDATE' AND (OLD.state NOT IN('draft','recording') OR NEW.input_revision<>OLD.input_revision OR NEW.state NOT IN('draft','recording','complete','cancelled')) THEN
  RAISE EXCEPTION 'Capture session input and workflow changed' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' AND NEW.state='cancelled' AND (NEW.room_checklist<>OLD.room_checklist OR NEW.clips<>OLD.clips OR NEW.active_room_id IS DISTINCT FROM OLD.active_room_id) THEN RAISE EXCEPTION 'Cancellation cannot edit the checklist' USING ERRCODE='23514';END IF;
 IF jsonb_array_length(NEW.room_checklist)>200 OR jsonb_array_length(NEW.clips)>256 OR octet_length(NEW.room_checklist::text)>65536 OR octet_length(NEW.clips::text)>65536 THEN
  RAISE EXCEPTION 'Capture checklist budget exceeded' USING ERRCODE='23514';
 END IF;
 IF NEW.active_room_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.room_checklist) r WHERE r->>'id'=NEW.active_room_id) THEN
  RAISE EXCEPTION 'Select a checklist room' USING ERRCODE='23514';
 END IF;
 IF NEW.state<>'cancelled' AND EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.clips) clip WHERE NOT EXISTS(
  SELECT 1 FROM digitization_capture_uploads u WHERE u.id=(clip->>'uploadId')::uuid AND u.digitization_id=NEW.digitization_id AND u.created_by=actor_id() AND u.state IN('uploading','complete')) OR NOT EXISTS(
  SELECT 1 FROM jsonb_array_elements(NEW.room_checklist) room WHERE room->>'id'=clip->>'roomId')) THEN
  RAISE EXCEPTION 'Current owned room clip required' USING ERRCODE='42501';
 END IF;
 IF NEW.state='complete' AND (jsonb_array_length(NEW.room_checklist)=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.room_checklist) r WHERE r->>'completed' IS DISTINCT FROM 'true') OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.clips) clip JOIN digitization_capture_uploads u ON u.id=(clip->>'uploadId')::uuid WHERE u.state<>'complete')) THEN
  RAISE EXCEPTION 'Complete rooms and uploaded clips before closing capture' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
