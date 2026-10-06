ALTER TABLE payments ADD COLUMN version int NOT NULL DEFAULT 1 CHECK(version>0),ADD COLUMN lease_version int,ADD COLUMN unit_version int,ADD COLUMN grant_version int,ADD COLUMN posted_at timestamptz,ADD COLUMN posted_by uuid REFERENCES profiles;
ALTER TABLE payments ADD CONSTRAINT payment_workflow_status CHECK(status IN ('draft','posted')),ADD CONSTRAINT payment_native_source CHECK((lease_version IS NULL AND unit_version IS NULL AND grant_version IS NULL AND status='posted') OR (lease_version IS NOT NULL AND unit_version IS NOT NULL AND grant_version IS NOT NULL AND lease_version>0 AND unit_version>0 AND grant_version>0));
ALTER TABLE payments ADD CONSTRAINT payment_posted_metadata CHECK(lease_version IS NULL OR (status='draft' AND posted_at IS NULL AND posted_by IS NULL) OR (status='posted' AND posted_at IS NOT NULL AND posted_by IS NOT NULL));
CREATE TABLE payment_evidence_history(payment_id uuid NOT NULL REFERENCES payments,version int NOT NULL,action text NOT NULL,snapshot jsonb NOT NULL,actor_id uuid NOT NULL REFERENCES profiles,at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(payment_id,version));
ALTER TABLE payment_evidence_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_evidence_history_read ON payment_evidence_history FOR SELECT USING(EXISTS(SELECT 1 FROM payments p WHERE p.id=payment_id));
CREATE POLICY payment_evidence_history_append ON payment_evidence_history FOR INSERT WITH CHECK(actor_id=actor_id() AND EXISTS(SELECT 1 FROM payments p WHERE p.id=payment_id AND p.version=payment_evidence_history.version AND management_finance_lock(p.organization_id)));
CREATE TRIGGER payment_evidence_history_immutable BEFORE UPDATE OR DELETE ON payment_evidence_history FOR EACH ROW EXECUTE FUNCTION lease_history_guard();
CREATE FUNCTION management_finance_member(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM profiles p JOIN memberships m ON m.user_id=p.id JOIN organizations o ON o.id=m.organization_id WHERE p.id=actor_id() AND p.state='active' AND m.status='active' AND m.role='finance' AND m.organization_id=target AND target=org_id() AND o.type='manager') $$;
CREATE POLICY payment_draft_scope ON payments AS RESTRICTIVE FOR SELECT USING(status='posted' OR management_admin() OR management_finance_member(organization_id));
DROP TRIGGER payments_immutable ON payments;
CREATE FUNCTION payment_evidence_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE l leases%ROWTYPE;unit jsonb;original payments%ROWTYPE;grant_version_now int;
BEGIN
 IF TG_OP IN ('UPDATE','DELETE') AND OLD.status='posted' THEN RAISE EXCEPTION 'Posted financial records are immutable; create a reversal';END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Payment evidence history is retained' USING ERRCODE='42501';END IF;
 IF current_user<>'haven_app' OR management_admin() THEN RETURN NEW;END IF;
 IF NOT management_finance_lock(NEW.organization_id) THEN RAISE EXCEPTION 'Actual current finance membership required' USING ERRCODE='42501';END IF;
 SELECT * INTO l FROM leases WHERE id=NEW.lease_id FOR SHARE;
 IF l.id IS NULL OR l.organization_id<>NEW.organization_id OR l.status NOT IN ('active','ended') OR l.currency<>NEW.currency OR NOT management_unit_granted(l.unit_id,l.organization_id) THEN RAISE EXCEPTION 'Granted lease and matching currency required' USING ERRCODE='23514';END IF;
 IF TG_OP='INSERT' AND NEW.reverses_id IS NOT NULL THEN
 SELECT * INTO original FROM payments WHERE id=NEW.reverses_id;
 IF original.id IS NULL OR original.status<>'posted' OR original.reverses_id IS NOT NULL OR original.lease_id<>NEW.lease_id OR original.organization_id<>NEW.organization_id OR original.amount<>NEW.amount OR original.currency<>NEW.currency OR NEW.source<>'reversal' OR NEW.status<>'posted' OR NEW.actor_id IS DISTINCT FROM actor_id() THEN RAISE EXCEPTION 'Exact posted payment reversal required' USING ERRCODE='23514';END IF;
 RETURN NEW;
 END IF;
 unit:=management_lease_unit(l.unit_id,l.organization_id);grant_version_now:=management_unit_grant_lock(l.unit_id,l.organization_id);
 IF NEW.lease_version IS NULL OR NEW.lease_version<>l.version OR NEW.unit_version IS NULL OR (unit->>'version')::int<>NEW.unit_version OR NEW.grant_version IS NULL OR grant_version_now IS NULL OR NEW.grant_version<>grant_version_now OR NEW.amount<=0 OR NEW.source NOT IN ('bank_statement','receipt','manual_evidence') OR length(trim(NEW.reference)) NOT BETWEEN 3 AND 120 OR NEW.reverses_id IS NOT NULL THEN RAISE EXCEPTION 'Native current payment evidence source required' USING ERRCODE='23514';END IF;
 IF TG_OP='INSERT' AND (NEW.status<>'draft' OR NEW.version<>1 OR NEW.actor_id IS DISTINCT FROM actor_id() OR NEW.posted_at IS NOT NULL OR NEW.posted_by IS NOT NULL) THEN RAISE EXCEPTION 'Payment evidence starts as an attributed draft' USING ERRCODE='23514';END IF;
 IF TG_OP='UPDATE' THEN
 IF NEW.version<>OLD.version+1 OR NEW.lease_id<>OLD.lease_id OR NEW.organization_id<>OLD.organization_id OR NEW.actor_id IS DISTINCT FROM OLD.actor_id OR NEW.created_at<>OLD.created_at THEN RAISE EXCEPTION 'Versioned immutable payment identity required' USING ERRCODE='42501';END IF;
 IF NEW.status='posted' THEN
 IF NEW.posted_by IS DISTINCT FROM actor_id() OR NEW.posted_at IS NULL OR (to_jsonb(NEW)-ARRAY['status','version','posted_at','posted_by']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','posted_at','posted_by']) THEN RAISE EXCEPTION 'Post the saved evidence with actual actor/time' USING ERRCODE='23514';END IF;
 ELSIF NEW.status<>'draft' OR NEW.posted_at IS NOT NULL OR NEW.posted_by IS NOT NULL THEN RAISE EXCEPTION 'Payment workflow state denied' USING ERRCODE='23514';END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payment_evidence_guard BEFORE INSERT OR UPDATE OR DELETE ON payments FOR EACH ROW EXECUTE FUNCTION payment_evidence_guard();
GRANT SELECT,INSERT ON payment_evidence_history TO haven_app;
REVOKE ALL ON FUNCTION management_finance_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION management_finance_member(uuid) TO haven_app;
