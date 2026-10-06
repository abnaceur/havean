ALTER TABLE deposits ADD COLUMN version int NOT NULL DEFAULT 1 CHECK(version=1),ADD COLUMN direction text CHECK(direction IN ('increase','decrease')),ADD COLUMN liability_version int CHECK(liability_version>0),ADD COLUMN lease_version int,ADD COLUMN unit_version int,ADD COLUMN grant_version int,ADD COLUMN held_before numeric(18,2),ADD COLUMN held_after numeric(18,2);
ALTER TABLE deposits ALTER COLUMN created_at SET DEFAULT statement_timestamp();
ALTER TABLE deposits ADD CONSTRAINT deposit_native_evidence CHECK((direction IS NULL AND liability_version IS NULL AND lease_version IS NULL AND unit_version IS NULL AND grant_version IS NULL AND held_before IS NULL AND held_after IS NULL) OR (direction IS NOT NULL AND liability_version IS NOT NULL AND lease_version>0 AND unit_version>0 AND grant_version>0 AND held_before IS NOT NULL AND held_after IS NOT NULL AND held_before>=0 AND held_after>=0 AND (kind='adjusted' OR kind='received' AND direction='increase' OR kind='released' AND direction='decrease')));
CREATE UNIQUE INDEX deposit_liability_sequence ON deposits(lease_id,liability_version) WHERE liability_version IS NOT NULL;
CREATE FUNCTION deposit_liability_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE l leases%ROWTYPE;unit jsonb;grant_now int;held numeric;sequence_now int;
BEGIN
 IF current_user<>'haven_app' THEN RETURN NEW;END IF;
 IF NOT management_finance_lock(NEW.organization_id) THEN RAISE EXCEPTION 'Actual finance authority required' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('lease_finance:'||NEW.lease_id::text,0));
 SELECT * INTO l FROM leases WHERE id=NEW.lease_id AND organization_id=NEW.organization_id AND status IN ('active','ended') FOR SHARE;
 IF l.id IS NULL THEN RAISE EXCEPTION 'Granted active or ended lease required' USING ERRCODE='23514';END IF;
 grant_now:=management_unit_grant_lock(l.unit_id,l.organization_id);unit:=management_lease_unit(l.unit_id,l.organization_id);
 SELECT count(*)::int,coalesce(sum(CASE WHEN coalesce(direction,CASE WHEN kind='received' THEN 'increase' ELSE 'decrease' END)='increase' THEN amount ELSE -amount END),0) INTO sequence_now,held FROM deposits WHERE lease_id=l.id;
 IF NEW.version<>1 OR NEW.actor_id IS DISTINCT FROM actor_id() OR NEW.liability_version IS DISTINCT FROM sequence_now+1 OR NEW.lease_version IS DISTINCT FROM l.version OR NEW.unit_version IS DISTINCT FROM (unit->>'version')::int OR grant_now IS NULL OR NEW.grant_version IS DISTINCT FROM grant_now OR NEW.currency<>l.currency OR NEW.amount<=0 OR NEW.direction IS NULL OR NEW.held_before IS DISTINCT FROM held OR NEW.held_after IS DISTINCT FROM (held+(CASE WHEN NEW.direction='increase' THEN NEW.amount ELSE -NEW.amount END)) OR NEW.held_after<0 OR length(btrim(NEW.reason)) NOT BETWEEN 5 AND 500 OR NEW.created_at IS DISTINCT FROM statement_timestamp() THEN RAISE EXCEPTION 'Current exact deposit evidence and nonnegative liability required' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER deposit_liability_guard BEFORE INSERT ON deposits FOR EACH ROW EXECUTE FUNCTION deposit_liability_guard();
