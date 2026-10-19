-- Intake evidence stays attached to its original private target. A draft link
-- neither transfers source grants nor approves a canonical listing.
CREATE TABLE digitization_intake_draft_links(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),digitization_id uuid NOT NULL UNIQUE REFERENCES property_digitizations,
 organization_id uuid NOT NULL REFERENCES organizations,created_by uuid NOT NULL REFERENCES profiles,
 created_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1 CHECK(version=1),
 workspace_version integer NOT NULL CHECK(workspace_version>0),input_revision integer NOT NULL,
 listing_id uuid NOT NULL UNIQUE REFERENCES listings,unit_id uuid NOT NULL REFERENCES units,
 decision_ids uuid[] NOT NULL CHECK(cardinality(decision_ids) BETWEEN 1 AND 20),
 unit_provenance jsonb NOT NULL CHECK(jsonb_typeof(unit_provenance)='object' AND octet_length(unit_provenance::text)<4096),
 FOREIGN KEY(digitization_id,input_revision) REFERENCES property_input_revisions(digitization_id,revision)
);
ALTER TABLE digitization_intake_draft_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY intake_draft_link_read ON digitization_intake_draft_links FOR SELECT USING(digitization_revision_access(digitization_id,input_revision,'preview'));
CREATE POLICY intake_draft_link_insert ON digitization_intake_draft_links FOR INSERT WITH CHECK(created_by=actor_id() AND digitization_revision_access(digitization_id,input_revision,'document_processing'));
CREATE FUNCTION digitization_intake_draft_link_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE workspace property_digitizations;selected record;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Intake draft links are immutable' USING ERRCODE='23514';END IF;
 SELECT * INTO workspace FROM property_digitizations WHERE id=NEW.digitization_id FOR UPDATE;
 IF workspace.id IS NULL OR workspace.target_type<>'intake' OR workspace.state<>'active' OR workspace.organization_id<>NEW.organization_id OR workspace.version<>NEW.workspace_version OR workspace.current_input_revision<>NEW.input_revision OR NEW.created_by<>actor_id() OR NOT digitization_revision_access(NEW.digitization_id,NEW.input_revision,'document_processing') OR NOT EXISTS(SELECT 1 FROM memberships m JOIN profiles p ON p.id=m.user_id AND p.state='active' JOIN organizations o ON o.id=m.organization_id AND o.type='agency' WHERE m.user_id=actor_id() AND m.organization_id=NEW.organization_id AND m.status='active' AND m.role IN('agent','agency_manager')) THEN RAISE EXCEPTION 'Current private intake and actor required' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM listings l JOIN units u ON u.id=l.unit_id WHERE l.id=NEW.listing_id AND l.unit_id=NEW.unit_id AND l.organization_id=NEW.organization_id AND u.organization_id=NEW.organization_id AND l.created_by=actor_id() AND l.status='draft' AND l.version=1) THEN RAISE EXCEPTION 'New scoped inventory draft required' USING ERRCODE='23514';END IF;
 IF (SELECT count(DISTINCT id) FROM fact_decisions WHERE id=ANY(NEW.decision_ids) AND digitization_id=NEW.digitization_id)<>cardinality(NEW.decision_ids) OR EXISTS(SELECT 1 FROM jsonb_each_text(NEW.unit_provenance) WHERE key NOT IN('communityId','area','beds','livingRooms','baths','orientation','floor','privateAddress') OR value NOT IN('confirmed_document','user')) THEN RAISE EXCEPTION 'Explicit bounded selection and unit provenance required' USING ERRCODE='23514';END IF;
 FOR selected IN SELECT d.*,f.version AS fact_version,f.input_revision AS fact_revision FROM fact_decisions d JOIN fact_candidates f ON f.id=d.candidate_id AND f.digitization_id=d.digitization_id WHERE d.id=ANY(NEW.decision_ids) LOOP
  IF selected.digitization_id<>NEW.digitization_id OR selected.fact_revision<>NEW.input_revision OR selected.candidate_version<>selected.fact_version OR selected.decision NOT IN('accepted','corrected') OR selected.id IS DISTINCT FROM (SELECT id FROM fact_decisions WHERE candidate_id=selected.candidate_id AND digitization_id=NEW.digitization_id ORDER BY created_at DESC,id DESC LIMIT 1) THEN RAISE EXCEPTION 'Current confirmed fact decisions required' USING ERRCODE='40001';END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER intake_draft_link_guard BEFORE INSERT OR UPDATE OR DELETE ON digitization_intake_draft_links FOR EACH ROW EXECUTE FUNCTION digitization_intake_draft_link_guard();
