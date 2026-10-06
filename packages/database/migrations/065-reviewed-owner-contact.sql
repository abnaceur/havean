CREATE FUNCTION copy_reviewed_owner_contact(submission uuid,listing uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE source owner_submissions%ROWTYPE; destination listings%ROWTYPE;
BEGIN
 IF NOT review_scope() AND NOT staff_scope() THEN RAISE EXCEPTION 'Ownership review authority required' USING ERRCODE='42501'; END IF;
 SELECT * INTO source FROM owner_submissions WHERE id=submission AND status='submitted';
 SELECT * INTO destination FROM listings WHERE id=listing;
 IF source.id IS NULL OR destination.id IS NULL OR source.user_id IS DISTINCT FROM destination.owner_id OR NOT EXISTS(SELECT 1 FROM owner_unit_grants g WHERE g.unit_id=destination.unit_id AND g.owner_id=source.user_id AND g.source='reviewed_submission' AND g.source_listing_id=destination.id AND g.verified_by=actor_id()) THEN RAISE EXCEPTION 'Contact transfer requires this independently reviewed owner relationship' USING ERRCODE='42501'; END IF;
 INSERT INTO listing_owner_contacts(listing_id,owner_id,contact,audience) VALUES(destination.id,source.user_id,source.data->>'contact',CASE WHEN source.data->>'contactAudience'='assigned_team' THEN 'assigned_team' ELSE 'reviewers_only' END);
END $$;
REVOKE ALL ON FUNCTION copy_reviewed_owner_contact(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION copy_reviewed_owner_contact(uuid,uuid) TO haven_app;
