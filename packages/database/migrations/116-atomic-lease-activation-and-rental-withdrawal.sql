CREATE OR REPLACE FUNCTION management_lease_unit(target uuid,target_org uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE snapshot jsonb;
BEGIN
 IF NOT management_unit_granted(target,target_org) THEN RETURN NULL;END IF;
 SELECT jsonb_build_object('id',u.id,'version',u.version,'currency',ci.currency,'community',co.name,'timezone',ci.timezone) INTO snapshot FROM units u JOIN communities co ON co.id=u.community_id JOIN districts d ON d.id=co.district_id JOIN cities ci ON ci.id=d.city_id WHERE u.id=target FOR SHARE OF u;
 RETURN snapshot;
END $$;
CREATE FUNCTION rental_lease_interval_free(target uuid,starts date,ends date,ignored uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM units WHERE id=target) AND NOT EXISTS(SELECT 1 FROM units subject JOIN units other ON other.id=subject.id OR other.id=subject.parent_unit_id OR other.parent_unit_id=subject.id JOIN leases l ON l.unit_id=other.id WHERE subject.id=target AND l.id IS DISTINCT FROM ignored AND l.status='active' AND daterange(l.start_date,l.end_date,'[]')&&daterange(starts,ends,'[]')) $$;
CREATE FUNCTION lease_active_exclusive_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.status='active' THEN PERFORM lock_rental_scope(NEW.unit_id);IF NOT rental_lease_interval_free(NEW.unit_id,NEW.start_date,NEW.end_date,NEW.id) THEN RAISE EXCEPTION 'Exclusive tenancy overlaps another active term' USING ERRCODE='23514';END IF;END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER lease_active_exclusive_guard BEFORE INSERT OR UPDATE ON leases FOR EACH ROW EXECUTE FUNCTION lease_active_exclusive_guard();
CREATE FUNCTION withdraw_lease_rental_offers(target uuid,target_org uuid) RETURNS TABLE(id uuid,version int) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE offer record;
BEGIN
 IF NOT management_inviter_lock(target_org) OR management_unit_grant_lock(target,target_org) IS NULL OR NOT EXISTS(SELECT 1 FROM leases l WHERE l.unit_id=target AND l.organization_id=target_org AND l.status='active') THEN RAISE EXCEPTION 'Current activated managed property required' USING ERRCODE='42501';END IF;
 PERFORM lock_rental_scope(target);
 FOR offer IN SELECT l.id,l.version FROM listings l JOIN units other ON other.id=l.unit_id JOIN units subject ON subject.id=target WHERE l.transaction='rent' AND l.status='published' AND (other.id=subject.id OR other.id=subject.parent_unit_id OR other.parent_unit_id=subject.id) ORDER BY l.id FOR UPDATE OF l LOOP
 UPDATE listings SET status='leased',version=offer.version+1 WHERE listings.id=offer.id;
 INSERT INTO listing_status_history(listing_id,previous_status,next_status,actor_id,reason,listing_version) VALUES(offer.id,'published','leased',actor_id(),'Lease activation reserved this canonical property.',offer.version+1);
 RETURN QUERY SELECT offer.id,offer.version+1;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION rental_lease_interval_free(uuid,date,date,uuid),withdraw_lease_rental_offers(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rental_lease_interval_free(uuid,date,date,uuid),withdraw_lease_rental_offers(uuid,uuid) TO haven_app;
