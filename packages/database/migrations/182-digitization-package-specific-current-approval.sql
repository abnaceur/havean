CREATE OR REPLACE FUNCTION digitization_approval_current(approval_ref uuid,engine_ref uuid,input_ref integer) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT digitization_target_access(engine_ref) AND digitization_revision_access(engine_ref,input_ref,'preview') AND EXISTS(SELECT 1 FROM approval_records a WHERE a.id=approval_ref AND a.digitization_id=engine_ref AND a.decision='approved')
 AND NOT EXISTS(SELECT 1 FROM digitization_approval_invalidations i WHERE i.approval_id=approval_ref AND i.digitization_id=engine_ref AND i.input_revision<=input_ref)
$$;
CREATE OR REPLACE FUNCTION digitization_package_freshness_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='INSERT' AND (NOT digitization_approval_current(NEW.approval_id,NEW.digitization_id,NEW.input_revision) OR NOT EXISTS(SELECT 1 FROM approval_records a WHERE a.id=NEW.approval_id AND a.digitization_id=NEW.digitization_id AND a.input_revision=NEW.input_revision AND a.scope='package' AND a.decision='approved') OR NOT EXISTS(SELECT 1 FROM property_digitizations d WHERE d.id=NEW.digitization_id AND d.current_input_revision=NEW.input_revision)) THEN
 RAISE EXCEPTION 'Current uninvalidated approval is required for a new package' USING ERRCODE='23514';END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION digitization_approval_current(uuid,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION digitization_approval_current(uuid,uuid,integer) TO haven_app;
