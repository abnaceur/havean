ALTER TABLE allocations ADD COLUMN version int NOT NULL DEFAULT 1 CHECK(version>0),ADD COLUMN allocated_by uuid REFERENCES profiles,ADD COLUMN payment_version int,ADD COLUMN charge_version int,ADD COLUMN lease_version int,ADD COLUMN unit_version int,ADD COLUMN grant_version int,ADD COLUMN reversed_by uuid REFERENCES profiles;
CREATE FUNCTION finance_allocation_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE p payments%ROWTYPE;ch charges%ROWTYPE;l leases%ROWTYPE;unit jsonb;used numeric;paid numeric;grant_version_now int;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Financial allocation history is retained' USING ERRCODE='42501';END IF;
 IF current_user<>'haven_app' OR management_admin() THEN RETURN NEW;END IF;
 IF NOT management_finance_lock(NEW.organization_id) THEN RAISE EXCEPTION 'Actual current finance membership required' USING ERRCODE='42501';END IF;
 SELECT * INTO p FROM payments WHERE id=NEW.payment_id;
 IF p.id IS NULL THEN RAISE EXCEPTION 'Granted payment required' USING ERRCODE='23514';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('lease_finance:'||p.lease_id::text,0));
 SELECT * INTO p FROM payments WHERE id=NEW.payment_id FOR UPDATE;
 SELECT * INTO ch FROM charges WHERE id=NEW.charge_id FOR UPDATE;
 SELECT * INTO l FROM leases WHERE id=p.lease_id FOR SHARE;
 IF ch.id IS NULL OR l.id IS NULL OR p.organization_id<>NEW.organization_id OR ch.organization_id<>NEW.organization_id OR p.lease_id<>ch.lease_id OR p.currency<>ch.currency OR p.currency<>l.currency OR p.status<>'posted' OR ch.status<>'posted' OR NOT management_unit_granted(l.unit_id,l.organization_id) THEN RAISE EXCEPTION 'Posted same-lease and currency resources required' USING ERRCODE='23514';END IF;
 IF TG_OP='UPDATE' THEN
 IF OLD.reversed_at IS NOT NULL OR NEW.reversed_at IS NULL OR NEW.reversed_by IS DISTINCT FROM actor_id() OR NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['version','reversed_at','reversed_by']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['version','reversed_at','reversed_by']) OR NOT(EXISTS(SELECT 1 FROM payments r WHERE r.reverses_id=p.id) OR EXISTS(SELECT 1 FROM charges r WHERE r.reverses_id=ch.id)) THEN RAISE EXCEPTION 'Immutable allocation or audited linked reversal required' USING ERRCODE='23514';END IF;
 RETURN NEW;
 END IF;
 unit:=management_lease_unit(l.unit_id,l.organization_id);grant_version_now:=management_unit_grant_lock(l.unit_id,l.organization_id);
 IF NEW.version<>1 OR NEW.allocated_by IS DISTINCT FROM actor_id() OR NEW.payment_version IS DISTINCT FROM p.version OR NEW.charge_version IS DISTINCT FROM ch.version OR NEW.lease_version IS DISTINCT FROM l.version OR NEW.unit_version IS DISTINCT FROM (unit->>'version')::int OR NEW.grant_version IS DISTINCT FROM grant_version_now OR NEW.reversed_at IS NOT NULL OR NEW.reversed_by IS NOT NULL OR NEW.amount<=0 OR p.reverses_id IS NOT NULL OR ch.reverses_id IS NOT NULL OR EXISTS(SELECT 1 FROM payments r WHERE r.reverses_id=p.id) OR EXISTS(SELECT 1 FROM charges r WHERE r.reverses_id=ch.id) THEN RAISE EXCEPTION 'Current versioned non-reversed allocation sources required' USING ERRCODE='23514';END IF;
 SELECT coalesce(sum(amount),0) INTO used FROM allocations WHERE payment_id=p.id AND reversed_at IS NULL;
 SELECT coalesce(sum(amount),0) INTO paid FROM allocations WHERE charge_id=ch.id AND reversed_at IS NULL;
 IF NEW.amount>p.amount-used OR NEW.amount>ch.amount-paid THEN RAISE EXCEPTION 'Allocation exceeds available credit or outstanding charge' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_allocation_guard BEFORE INSERT OR UPDATE OR DELETE ON allocations FOR EACH ROW EXECUTE FUNCTION finance_allocation_guard();
