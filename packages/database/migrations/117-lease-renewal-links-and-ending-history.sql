CREATE TABLE lease_renewals(previous_lease_id uuid PRIMARY KEY REFERENCES leases,lease_id uuid NOT NULL UNIQUE REFERENCES leases,previous_version int NOT NULL CHECK(previous_version>0),reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 500),actor_id uuid NOT NULL REFERENCES profiles,at timestamptz NOT NULL DEFAULT now(),CHECK(previous_lease_id<>lease_id));
CREATE TABLE lease_endings(lease_id uuid PRIMARY KEY REFERENCES leases,version int NOT NULL CHECK(version>0),kind text NOT NULL CHECK(kind IN ('completed','terminated')),reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 500),actor_id uuid NOT NULL REFERENCES profiles,at timestamptz NOT NULL DEFAULT now(),availability_review_required boolean NOT NULL DEFAULT true CHECK(availability_review_required));
ALTER TABLE lease_renewals ENABLE ROW LEVEL SECURITY;
ALTER TABLE lease_endings ENABLE ROW LEVEL SECURITY;
CREATE POLICY lease_renewal_read ON lease_renewals FOR SELECT USING(EXISTS(SELECT 1 FROM leases l WHERE l.id=lease_id));
CREATE POLICY lease_renewal_append ON lease_renewals FOR INSERT WITH CHECK(actor_id=actor_id() AND EXISTS(SELECT 1 FROM leases l WHERE l.id=lease_id AND management_unit_granted(l.unit_id,l.organization_id)));
CREATE POLICY lease_ending_read ON lease_endings FOR SELECT USING(EXISTS(SELECT 1 FROM leases l WHERE l.id=lease_id));
CREATE POLICY lease_ending_append ON lease_endings FOR INSERT WITH CHECK(actor_id=actor_id() AND EXISTS(SELECT 1 FROM leases l WHERE l.id=lease_id AND management_unit_granted(l.unit_id,l.organization_id)));
CREATE TRIGGER lease_renewal_immutable BEFORE UPDATE OR DELETE ON lease_renewals FOR EACH ROW EXECUTE FUNCTION lease_history_guard();
CREATE TRIGGER lease_ending_immutable BEFORE UPDATE OR DELETE ON lease_endings FOR EACH ROW EXECUTE FUNCTION lease_history_guard();
CREATE FUNCTION lease_renewal_link_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE previous leases%ROWTYPE;next leases%ROWTYPE;
BEGIN
 SELECT * INTO next FROM leases WHERE id=NEW.lease_id;
 PERFORM lock_rental_scope(next.unit_id);
 SELECT * INTO previous FROM leases WHERE id=NEW.previous_lease_id FOR SHARE;
 IF next.id IS NULL OR previous.id IS NULL OR previous.status NOT IN ('active','ended') OR previous.version<>NEW.previous_version OR next.status<>'draft' OR next.unit_id<>previous.unit_id OR next.organization_id<>previous.organization_id OR next.tenant_id<>previous.tenant_id OR next.start_date<=previous.end_date OR NEW.actor_id IS DISTINCT FROM actor_id() OR NOT management_inviter_lock(next.organization_id) OR NOT management_unit_granted(next.unit_id,next.organization_id) THEN RAISE EXCEPTION 'Current versioned next lease term required' USING ERRCODE='23514';END IF;
 IF NOT rental_lease_interval_free(next.unit_id,next.start_date,next.end_date,next.id) THEN RAISE EXCEPTION 'Renewal overlaps active occupation' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER lease_renewal_link_guard BEFORE INSERT ON lease_renewals FOR EACH ROW EXECUTE FUNCTION lease_renewal_link_guard();
CREATE FUNCTION lease_renewed_term_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM lease_renewals r JOIN leases p ON p.id=r.previous_lease_id WHERE r.lease_id=NEW.id AND NEW.start_date<=p.end_date) THEN RAISE EXCEPTION 'Renewed term must remain after original term' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER lease_renewed_term_guard BEFORE UPDATE ON leases FOR EACH ROW EXECUTE FUNCTION lease_renewed_term_guard();
CREATE FUNCTION lease_ending_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE l leases%ROWTYPE;
BEGIN
 SELECT * INTO l FROM leases WHERE id=NEW.lease_id;
 IF l.id IS NULL OR l.status<>'active' OR NEW.version<>l.version+1 OR NEW.actor_id IS DISTINCT FROM actor_id() OR NOT management_inviter_lock(l.organization_id) OR NOT management_unit_granted(l.unit_id,l.organization_id) THEN RAISE EXCEPTION 'Versioned active managed lease required' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER lease_ending_guard BEFORE INSERT ON lease_endings FOR EACH ROW EXECUTE FUNCTION lease_ending_guard();
GRANT SELECT,INSERT ON lease_renewals,lease_endings TO haven_app;
