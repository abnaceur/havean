CREATE TABLE financial_reversal_evidence(record_type text NOT NULL CHECK(record_type IN ('charge','payment')),original_id uuid NOT NULL,reversal_id uuid NOT NULL UNIQUE,organization_id uuid NOT NULL REFERENCES organizations,lease_id uuid NOT NULL REFERENCES leases,original_version int NOT NULL CHECK(original_version>0),lease_version int NOT NULL CHECK(lease_version>0),unit_version int NOT NULL CHECK(unit_version>0),grant_version int NOT NULL CHECK(grant_version>0),reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 5 AND 500),actor_id uuid NOT NULL REFERENCES profiles,at timestamptz NOT NULL DEFAULT statement_timestamp(),PRIMARY KEY(record_type,original_id));
ALTER TABLE financial_reversal_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY financial_reversal_read ON financial_reversal_evidence FOR SELECT USING(management_admin() OR (management_finance_member(organization_id) AND EXISTS(SELECT 1 FROM leases l WHERE l.id=lease_id AND management_unit_granted(l.unit_id,l.organization_id))));
CREATE POLICY financial_reversal_append ON financial_reversal_evidence FOR INSERT WITH CHECK(actor_id=actor_id() AND management_finance_lock(organization_id));
CREATE TRIGGER financial_reversal_immutable BEFORE UPDATE OR DELETE ON financial_reversal_evidence FOR EACH ROW EXECUTE FUNCTION lease_history_guard();
CREATE FUNCTION financial_reversal_source_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE root jsonb;l leases%ROWTYPE;unit jsonb;grant_now int;
BEGIN
 IF current_user<>'haven_app' OR management_admin() THEN RETURN NEW;END IF;
 IF NOT management_finance_lock(NEW.organization_id) OR NEW.actor_id IS DISTINCT FROM actor_id() OR NEW.at IS DISTINCT FROM statement_timestamp() THEN RAISE EXCEPTION 'Actual finance reversal actor required' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('lease_finance:'||NEW.lease_id::text,0));
 IF NEW.record_type='payment' THEN SELECT to_jsonb(p) INTO root FROM payments p WHERE p.id=NEW.original_id FOR UPDATE;ELSE SELECT to_jsonb(ch) INTO root FROM charges ch WHERE ch.id=NEW.original_id FOR UPDATE;END IF;
 SELECT * INTO l FROM leases WHERE id=NEW.lease_id FOR SHARE;
 unit:=management_lease_unit(l.unit_id,l.organization_id);grant_now:=management_unit_grant_lock(l.unit_id,l.organization_id);
 IF root IS NULL OR root->>'reverses_id' IS NOT NULL OR root->>'status'<>'posted' OR (root->>'lease_id')::uuid IS DISTINCT FROM NEW.lease_id OR (root->>'organization_id')::uuid IS DISTINCT FROM NEW.organization_id OR (root->>'version')::int IS DISTINCT FROM NEW.original_version OR l.id IS NULL OR l.status NOT IN ('active','ended') OR NEW.lease_version IS DISTINCT FROM l.version OR NEW.unit_version IS DISTINCT FROM (unit->>'version')::int OR grant_now IS NULL OR NEW.grant_version IS DISTINCT FROM grant_now THEN RAISE EXCEPTION 'Current granted posted reversal source required' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER financial_reversal_source_guard BEFORE INSERT ON financial_reversal_evidence FOR EACH ROW EXECUTE FUNCTION financial_reversal_source_guard();
CREATE FUNCTION financial_linked_reversal_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE evidence financial_reversal_evidence%ROWTYPE;root jsonb;
BEGIN
 IF NEW.reverses_id IS NULL OR current_user<>'haven_app' OR management_admin() THEN RETURN NEW;END IF;
 SELECT * INTO evidence FROM financial_reversal_evidence WHERE record_type=CASE WHEN TG_TABLE_NAME='payments' THEN 'payment' ELSE 'charge' END AND original_id=NEW.reverses_id AND reversal_id=NEW.id AND actor_id=actor_id();
 IF TG_TABLE_NAME='payments' THEN SELECT to_jsonb(p) INTO root FROM payments p WHERE p.id=NEW.reverses_id;ELSE SELECT to_jsonb(ch) INTO root FROM charges ch WHERE ch.id=NEW.reverses_id;END IF;
 IF evidence.original_id IS NULL OR root IS NULL OR evidence.organization_id IS DISTINCT FROM NEW.organization_id OR evidence.lease_id IS DISTINCT FROM NEW.lease_id OR (root->>'amount')::numeric IS DISTINCT FROM NEW.amount OR root->>'currency' IS DISTINCT FROM NEW.currency OR NEW.status<>'posted' THEN RAISE EXCEPTION 'Attributed exact linked reversal evidence required' USING ERRCODE='23514';END IF;
 IF TG_TABLE_NAME='charges' AND ((root->>'period')::date IS DISTINCT FROM NEW.period OR (root->>'due_date')::date IS DISTINCT FROM NEW.due_date OR NEW.kind IS DISTINCT FROM 'reversal:'||NEW.reverses_id::text) THEN RAISE EXCEPTION 'Exact charge period and due date required' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER financial_linked_reversal_guard BEFORE INSERT ON payments FOR EACH ROW EXECUTE FUNCTION financial_linked_reversal_guard();
CREATE TRIGGER financial_linked_reversal_guard BEFORE INSERT ON charges FOR EACH ROW EXECUTE FUNCTION financial_linked_reversal_guard();
CREATE FUNCTION financial_reversal_commit_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE linked boolean;pending boolean;
BEGIN
 IF NEW.record_type='payment' THEN
 SELECT EXISTS(SELECT 1 FROM payments r JOIN payments p ON p.id=r.reverses_id WHERE r.id=NEW.reversal_id AND p.id=NEW.original_id AND r.lease_id=NEW.lease_id AND r.organization_id=NEW.organization_id AND r.amount=p.amount AND r.currency=p.currency AND r.status='posted') INTO linked;
 SELECT EXISTS(SELECT 1 FROM allocations WHERE payment_id=NEW.original_id AND reversed_at IS NULL) INTO pending;
 ELSE
 SELECT EXISTS(SELECT 1 FROM charges r JOIN charges ch ON ch.id=r.reverses_id WHERE r.id=NEW.reversal_id AND ch.id=NEW.original_id AND r.lease_id=NEW.lease_id AND r.organization_id=NEW.organization_id AND r.amount=ch.amount AND r.currency=ch.currency AND r.status='posted') INTO linked;
 SELECT EXISTS(SELECT 1 FROM allocations WHERE charge_id=NEW.original_id AND reversed_at IS NULL) INTO pending;
 END IF;
 IF NOT linked OR pending THEN RAISE EXCEPTION 'Reversal and allocation undo must commit together' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER financial_reversal_commit_guard AFTER INSERT ON financial_reversal_evidence DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION financial_reversal_commit_guard();
GRANT SELECT,INSERT ON financial_reversal_evidence TO haven_app;
