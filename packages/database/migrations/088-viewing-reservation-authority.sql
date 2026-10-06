ALTER TABLE viewings ADD COLUMN listing_version int,ADD COLUMN availability_version int,ADD COLUMN property_zone text,ADD COLUMN buffer_minutes int NOT NULL DEFAULT 0 CHECK(buffer_minutes BETWEEN 0 AND 120 AND buffer_minutes%5=0);
CREATE FUNCTION viewing_reservation_context(target uuid) RETURNS TABLE(listing_version int,agent_id uuid,time_zone text,schedule_version int,duration_minutes int,buffer_minutes int) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE destination record;zone text;policy viewing_availability%ROWTYPE;
BEGIN
 SELECT * INTO destination FROM published_listing_destination(target);
 IF NOT FOUND THEN RETURN;END IF;
 SELECT ci.timezone INTO zone FROM listings l JOIN units u ON u.id=l.unit_id JOIN communities co ON co.id=u.community_id JOIN districts d ON d.id=co.district_id JOIN cities ci ON ci.id=d.city_id WHERE l.id=target FOR SHARE OF ci;
 PERFORM 1 FROM agents a JOIN profiles p ON p.id=a.user_id JOIN memberships m ON m.user_id=a.user_id AND m.organization_id=a.organization_id WHERE a.id=destination.agent_id AND a.organization_id=destination.organization_id AND p.state='active' AND m.status='active' AND m.role IN('agent','agency_manager') FOR SHARE OF a,p,m;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public_listing_agents(target) a WHERE a.id=destination.agent_id) THEN
  RETURN QUERY SELECT l.version,NULL::uuid,zone,NULL::int,NULL::int,NULL::int FROM listings l WHERE l.id=target;RETURN;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('viewing-agent:'||destination.agent_id::text,0));
 SELECT * INTO policy FROM viewing_availability v WHERE v.listing_id=target AND v.agent_id=destination.agent_id AND v.time_zone=zone AND v.status='active' FOR SHARE;
 RETURN QUERY SELECT l.version,destination.agent_id,zone,policy.version,policy.duration_minutes,policy.buffer_minutes FROM listings l WHERE l.id=target;
END $$;
CREATE FUNCTION viewing_slot_valid(target uuid,starts timestamptz,ends timestamptz,skip_id uuid DEFAULT NULL,retained_gap int DEFAULT 0) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE policy viewing_availability%ROWTYPE;local_start timestamp;local_end timestamp;gap int;
BEGIN
 SELECT * INTO policy FROM viewing_availability v WHERE v.listing_id=target AND v.status='active';IF NOT FOUND THEN RETURN false;END IF;
 IF NOT EXISTS(SELECT 1 FROM public_listings l JOIN public_listing_agents(target) a ON a.id=policy.agent_id JOIN cities ci ON ci.slug=l.city WHERE l.id=target AND ci.timezone=policy.time_zone) THEN RETURN false;END IF;
 local_start:=starts AT TIME ZONE policy.time_zone;local_end:=local_start+make_interval(mins=>policy.duration_minutes);gap:=greatest(policy.buffer_minutes,retained_gap);
 IF starts IS NULL OR ends IS NULL OR starts<=statement_timestamp() OR viewing_local_instant(local_start,policy.time_zone) IS DISTINCT FROM starts OR viewing_local_instant(local_end,policy.time_zone) IS DISTINCT FROM ends OR ends-starts<>make_interval(mins=>policy.duration_minutes) OR NOT(extract(dow FROM local_start)::int=ANY(policy.weekdays)) OR local_start::time<policy.opens_at OR local_end::date<>local_start::date OR local_end::time>policy.closes_at OR mod(extract(epoch FROM local_start::time-policy.opens_at)::numeric,900)<>0 THEN RETURN false;END IF;
 RETURN NOT EXISTS(SELECT 1 FROM viewing_availability_blocks b WHERE b.agent_id=policy.agent_id AND b.status='active' AND tstzrange(b.start_at,b.end_at,'[)')&&tstzrange(starts-make_interval(mins=>gap),ends+make_interval(mins=>gap),'[)'))
 AND NOT EXISTS(SELECT 1 FROM viewings v WHERE v.agent_id=policy.agent_id AND v.status IN('requested','confirmed') AND v.id IS DISTINCT FROM skip_id AND tstzrange(v.start_at,v.end_at,'[)')&&tstzrange(starts-make_interval(mins=>greatest(gap,v.buffer_minutes)),ends+make_interval(mins=>greatest(gap,v.buffer_minutes)),'[)'));
END $$;
REVOKE ALL ON FUNCTION viewing_reservation_context(uuid),viewing_slot_valid(uuid,timestamptz,timestamptz,uuid,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION viewing_reservation_context(uuid),viewing_slot_valid(uuid,timestamptz,timestamptz,uuid,int) TO haven_app;
CREATE FUNCTION viewing_booking_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ctx record;
BEGIN
 IF staff_scope() THEN RETURN NEW;END IF;
 PERFORM 1 FROM profiles p WHERE p.id=actor_id() AND p.state='active' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Active viewing actor required' USING ERRCODE='42501';END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.user_id<>actor_id() OR NEW.status<>'requested' OR NEW.version<>1 THEN RAISE EXCEPTION 'Own new viewing request required' USING ERRCODE='42501';END IF;
 ELSE
  IF NEW.version<>OLD.version+1 OR (NEW.listing_id,NEW.user_id,NEW.agent_id,NEW.start_at,NEW.end_at) IS DISTINCT FROM (OLD.listing_id,OLD.user_id,OLD.agent_id,OLD.start_at,OLD.end_at) OR OLD.status NOT IN('requested','confirmed') THEN RAISE EXCEPTION 'Current viewing transition required' USING ERRCODE='23514';END IF;
  IF NEW.status='cancelled' AND (OLD.user_id=actor_id() OR viewing_schedule_scope(OLD.listing_id,OLD.agent_id)) THEN
   IF (NEW.listing_version,NEW.availability_version,NEW.property_zone,NEW.buffer_minutes) IS DISTINCT FROM (OLD.listing_version,OLD.availability_version,OLD.property_zone,OLD.buffer_minutes) THEN RAISE EXCEPTION 'Cancellation preserves reservation metadata' USING ERRCODE='23514';END IF;RETURN NEW;
  END IF;
  IF NEW.status<>'confirmed' OR OLD.status<>'requested' OR NOT viewing_schedule_scope(OLD.listing_id,OLD.agent_id) THEN RAISE EXCEPTION 'Assigned professional confirmation required' USING ERRCODE='42501';END IF;
 END IF;
 SELECT * INTO ctx FROM viewing_reservation_context(NEW.listing_id);
 IF NOT FOUND OR ctx.agent_id IS DISTINCT FROM NEW.agent_id OR ctx.listing_version IS DISTINCT FROM NEW.listing_version OR ctx.schedule_version IS NULL OR ctx.schedule_version IS DISTINCT FROM NEW.availability_version OR ctx.time_zone IS DISTINCT FROM NEW.property_zone OR NEW.buffer_minutes<ctx.buffer_minutes THEN RAISE EXCEPTION 'Current published viewing availability required' USING ERRCODE='23514';END IF;
 IF NOT viewing_slot_valid(NEW.listing_id,NEW.start_at,NEW.end_at,CASE WHEN TG_OP='UPDATE' THEN NEW.id ELSE NULL END,NEW.buffer_minutes) THEN RAISE EXCEPTION 'Viewing interval unavailable' USING ERRCODE='23P01';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER viewing_booking_authority BEFORE INSERT OR UPDATE ON viewings FOR EACH ROW EXECUTE FUNCTION viewing_booking_guard();
-- Existing minimum travel gaps survive policy edits on other properties.
CREATE OR REPLACE FUNCTION public_viewing_slot_rows(target uuid,first_date date DEFAULT NULL,day_count int DEFAULT 7) RETURNS TABLE(start_at timestamptz,end_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE policy viewing_availability%ROWTYPE;first_day date;zone text;
BEGIN
 IF day_count IS NULL OR day_count NOT BETWEEN 1 AND 7 THEN RAISE EXCEPTION 'Invalid viewing date range' USING ERRCODE='23514';END IF;
 SELECT s.time_zone INTO zone FROM public_viewing_schedule(target) s WHERE s.schedule_version IS NOT NULL;IF zone IS NULL THEN RETURN;END IF;
 SELECT * INTO policy FROM viewing_availability v WHERE v.listing_id=target FOR SHARE;first_day:=coalesce(first_date,(statement_timestamp() AT TIME ZONE zone)::date);
 RETURN QUERY WITH days AS (SELECT (first_day+n)::date local_day FROM generate_series(0,day_count-1) n),candidates AS (SELECT viewing_local_instant(slot.local_start,zone) starts,viewing_local_instant(slot.local_start+make_interval(mins=>policy.duration_minutes),zone) ends FROM days d CROSS JOIN LATERAL generate_series(d.local_day+policy.opens_at,d.local_day+policy.closes_at-make_interval(mins=>policy.duration_minutes),interval '15 minutes') slot(local_start))
 SELECT c.starts,c.ends FROM candidates c WHERE viewing_slot_valid(target,c.starts,c.ends) ORDER BY c.starts LIMIT 200;
END $$;
