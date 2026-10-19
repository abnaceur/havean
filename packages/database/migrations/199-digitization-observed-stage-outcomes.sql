-- Append-only scoped outcomes. Times are observed by PostgreSQL, never worker
-- text or submitted measurements. The interval includes lease/startup/transfer.
CREATE TABLE digitization_stage_outcomes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),digitization_id uuid NOT NULL REFERENCES property_digitizations,
 organization_id uuid NOT NULL REFERENCES organizations,created_by uuid NOT NULL REFERENCES profiles,
 run_id uuid NOT NULL,stage_id uuid NOT NULL,attempt_id uuid NOT NULL,execution_id uuid NOT NULL UNIQUE,
 fencing_token bigint NOT NULL CHECK(fencing_token>0),input_revision integer NOT NULL,
 outcome text NOT NULL CHECK(outcome IN('succeeded','failed_retryable','failed_terminal')),
 error_code text CHECK(error_code ~ '^[A-Z][A-Z0-9_]{1,99}$'),
 started_at timestamptz NOT NULL,finished_at timestamptz NOT NULL,elapsed_seconds NUMERIC(20,6) CHECK(elapsed_seconds>=0),
 FOREIGN KEY(run_id,digitization_id) REFERENCES processing_runs(id,digitization_id),
 FOREIGN KEY(stage_id,digitization_id) REFERENCES processing_stages(id,digitization_id),
 FOREIGN KEY(attempt_id,digitization_id) REFERENCES stage_attempts(id,digitization_id),
 FOREIGN KEY(digitization_id,input_revision) REFERENCES property_input_revisions(digitization_id,revision)
);
CREATE INDEX digitization_stage_outcomes_current ON digitization_stage_outcomes(digitization_id,input_revision);
ALTER TABLE digitization_stage_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY stage_outcome_read ON digitization_stage_outcomes FOR SELECT USING(digitization_revision_access(digitization_id,input_revision,'preview'));
CREATE POLICY stage_outcome_create ON digitization_stage_outcomes FOR INSERT WITH CHECK(created_by=actor_id() AND organization_id=org_id() AND digitization_revision_access(digitization_id,input_revision,'document_processing'));
CREATE FUNCTION digitization_stage_outcome_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE stage processing_stages;attempt stage_attempts;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Observed stage outcomes are immutable' USING ERRCODE='23514';END IF;
 SELECT * INTO stage FROM processing_stages WHERE id=NEW.stage_id AND digitization_id=NEW.digitization_id;
 SELECT * INTO attempt FROM stage_attempts WHERE id=NEW.attempt_id AND digitization_id=NEW.digitization_id;
 IF stage.id IS NULL OR attempt.id IS NULL OR stage.run_id<>NEW.run_id OR stage.input_revision<>NEW.input_revision OR stage.organization_id<>NEW.organization_id OR stage.created_by<>actor_id() OR NEW.created_by<>actor_id() OR stage.execution_id<>NEW.execution_id OR stage.fencing_token<>NEW.fencing_token OR stage.state<>NEW.outcome OR attempt.stage_id<>stage.id OR attempt.execution_id<>NEW.execution_id OR attempt.fencing_token<>NEW.fencing_token OR NOT digitization_revision_access(NEW.digitization_id,NEW.input_revision,'document_processing') THEN RAISE EXCEPTION 'Exact current scoped execution outcome required' USING ERRCODE='42501';END IF;
 NEW.error_code:=CASE WHEN stage.error_code ~ '^[A-Z][A-Z0-9_]{1,99}$' THEN stage.error_code ELSE NULL END;
 NEW.started_at:=attempt.started_at;NEW.finished_at:=clock_timestamp();
 NEW.elapsed_seconds:=CASE WHEN NEW.finished_at>=NEW.started_at THEN extract(epoch FROM NEW.finished_at-NEW.started_at)::NUMERIC(20,6) ELSE NULL END;
 RETURN NEW;
END $$;
CREATE TRIGGER digitization_stage_outcome_guard BEFORE INSERT OR UPDATE OR DELETE ON digitization_stage_outcomes FOR EACH ROW EXECUTE FUNCTION digitization_stage_outcome_guard();
