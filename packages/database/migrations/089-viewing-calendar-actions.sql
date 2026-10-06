CREATE FUNCTION professional_viewing_scope(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM viewings v JOIN listings l ON l.id=v.listing_id JOIN agents a ON a.id=v.agent_id AND a.organization_id=l.organization_id JOIN organizations o ON o.id=l.organization_id AND o.type='agency' JOIN memberships m ON m.organization_id=l.organization_id AND m.user_id=actor_id() AND m.status='active' JOIN profiles p ON p.id=m.user_id AND p.state='active' WHERE v.id=target AND l.organization_id=org_id() AND (m.role IN('agency_manager','admin') OR m.role='agent' AND a.user_id=actor_id()))
$$;
CREATE FUNCTION viewing_calendar_rows(professional boolean,stage text DEFAULT NULL,first_date date DEFAULT NULL,last_date date DEFAULT NULL,row_offset int DEFAULT 0) RETURNS TABLE(id uuid,listing_id uuid,agent_id uuid,start_at timestamptz,end_at timestamptz,status text,version int,title text,time_zone text,zone_source text,current_listing_version int,current_schedule_version int,buffer_minutes int) LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT v.id,v.listing_id,v.agent_id,v.start_at,v.end_at,v.status,v.version,CASE WHEN professional OR rental_listing_available(l.id) THEN l.title ELSE 'Unavailable property' END,coalesce(v.property_zone,ci.timezone),CASE WHEN v.property_zone IS NULL THEN 'current' ELSE 'recorded' END,l.version,policy.version,v.buffer_minutes
 FROM viewings v JOIN listings l ON l.id=v.listing_id JOIN units u ON u.id=l.unit_id JOIN communities co ON co.id=u.community_id JOIN districts d ON d.id=co.district_id JOIN cities ci ON ci.id=d.city_id LEFT JOIN viewing_availability policy ON policy.listing_id=l.id AND policy.agent_id=l.agent_id AND policy.time_zone=ci.timezone AND policy.status='active'
 WHERE EXISTS(SELECT 1 FROM profiles p WHERE p.id=actor_id() AND p.state='active') AND (CASE WHEN professional THEN professional_viewing_scope(v.id) ELSE v.user_id=actor_id() END) AND (stage IS NULL OR v.status=stage) AND (first_date IS NULL OR (v.start_at AT TIME ZONE coalesce(v.property_zone,ci.timezone))::date>=first_date) AND (last_date IS NULL OR (v.start_at AT TIME ZONE coalesce(v.property_zone,ci.timezone))::date<=last_date) AND row_offset BETWEEN 0 AND 499950
 ORDER BY v.start_at DESC,v.id LIMIT 51 OFFSET greatest(0,row_offset)
$$;
CREATE FUNCTION viewing_candidate_rows(target uuid,first_date date,day_count int,skip_id uuid) RETURNS TABLE(start_at timestamptz,end_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE policy viewing_availability%ROWTYPE;first_day date;zone text;gap int;
BEGIN
 IF day_count IS NULL OR day_count NOT BETWEEN 1 AND 7 THEN RAISE EXCEPTION 'Invalid viewing date range' USING ERRCODE='23514';END IF;
 SELECT s.time_zone INTO zone FROM public_viewing_schedule(target) s WHERE s.schedule_version IS NOT NULL;IF zone IS NULL THEN RETURN;END IF;
 SELECT * INTO policy FROM viewing_availability v WHERE v.listing_id=target FOR SHARE;first_day:=coalesce(first_date,(statement_timestamp() AT TIME ZONE zone)::date);
 SELECT coalesce(v.buffer_minutes,0) INTO gap FROM viewings v WHERE v.id=skip_id;gap:=coalesce(gap,0);
 RETURN QUERY WITH days AS (SELECT (first_day+n)::date local_day FROM generate_series(0,day_count-1) n),candidates AS (SELECT viewing_local_instant(slot.local_start,zone) starts,viewing_local_instant(slot.local_start+make_interval(mins=>policy.duration_minutes),zone) ends FROM days d CROSS JOIN LATERAL generate_series(d.local_day+policy.opens_at,d.local_day+policy.closes_at-make_interval(mins=>policy.duration_minutes),interval '15 minutes') slot(local_start))
 SELECT c.starts,c.ends FROM candidates c WHERE viewing_slot_valid(target,c.starts,c.ends,skip_id,gap) ORDER BY c.starts LIMIT 200;
END $$;
CREATE OR REPLACE FUNCTION public_viewing_slot_rows(target uuid,first_date date DEFAULT NULL,day_count int DEFAULT 7) RETURNS TABLE(start_at timestamptz,end_at timestamptz) LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT * FROM viewing_candidate_rows(target,first_date,day_count,NULL)
$$;
CREATE FUNCTION viewing_reschedule_slot_rows(target uuid,first_date date DEFAULT NULL,day_count int DEFAULT 7) RETURNS TABLE(start_at timestamptz,end_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE booking viewings%ROWTYPE;
BEGIN
 SELECT * INTO booking FROM viewings v WHERE v.id=target AND (v.user_id=actor_id() OR professional_viewing_scope(v.id)) AND v.status IN('requested','confirmed');IF NOT FOUND THEN RETURN;END IF;
 RETURN QUERY SELECT * FROM viewing_candidate_rows(booking.listing_id,first_date,day_count,target);
END $$;
REVOKE ALL ON FUNCTION professional_viewing_scope(uuid),viewing_calendar_rows(boolean,text,date,date,int),viewing_candidate_rows(uuid,date,int,uuid),viewing_reschedule_slot_rows(uuid,date,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION professional_viewing_scope(uuid),viewing_calendar_rows(boolean,text,date,date,int),viewing_reschedule_slot_rows(uuid,date,int) TO haven_app;
CREATE OR REPLACE FUNCTION viewing_booking_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ctx record;professional boolean;moving boolean;
BEGIN
 IF staff_scope() THEN RETURN NEW;END IF;
 PERFORM 1 FROM profiles p WHERE p.id=actor_id() AND p.state='active' FOR SHARE;IF NOT FOUND THEN RAISE EXCEPTION 'Active viewing actor required' USING ERRCODE='42501';END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.user_id<>actor_id() OR NEW.status<>'requested' OR NEW.version<>1 THEN RAISE EXCEPTION 'Own new viewing request required' USING ERRCODE='42501';END IF;
 ELSE
  professional:=professional_viewing_scope(OLD.id);moving:=(NEW.start_at,NEW.end_at) IS DISTINCT FROM (OLD.start_at,OLD.end_at);
  IF NEW.version<>OLD.version+1 OR (NEW.listing_id,NEW.user_id,NEW.agent_id) IS DISTINCT FROM (OLD.listing_id,OLD.user_id,OLD.agent_id) OR OLD.status NOT IN('requested','confirmed') THEN RAISE EXCEPTION 'Current viewing transition required' USING ERRCODE='23514';END IF;
  IF NEW.status='cancelled' AND NOT moving AND (OLD.user_id=actor_id() OR professional) OR NEW.status IN('completed','no_show') AND OLD.status='confirmed' AND NOT moving AND professional AND OLD.end_at<=statement_timestamp() THEN
   IF (NEW.listing_version,NEW.availability_version,NEW.property_zone,NEW.buffer_minutes) IS DISTINCT FROM (OLD.listing_version,OLD.availability_version,OLD.property_zone,OLD.buffer_minutes) THEN RAISE EXCEPTION 'Terminal action preserves reservation metadata' USING ERRCODE='23514';END IF;RETURN NEW;
  END IF;
  IF moving THEN
   IF NOT(OLD.user_id=actor_id() OR professional) OR NEW.status<>(CASE WHEN professional THEN OLD.status ELSE 'requested' END) THEN RAISE EXCEPTION 'Authorized reschedule required' USING ERRCODE='42501';END IF;
  ELSIF NEW.status<>'confirmed' OR OLD.status<>'requested' OR NOT viewing_schedule_scope(OLD.listing_id,OLD.agent_id) THEN RAISE EXCEPTION 'Assigned professional confirmation required' USING ERRCODE='42501';END IF;
 END IF;
 SELECT * INTO ctx FROM viewing_reservation_context(NEW.listing_id);
 IF NOT FOUND OR ctx.agent_id IS DISTINCT FROM NEW.agent_id OR ctx.listing_version IS DISTINCT FROM NEW.listing_version OR ctx.schedule_version IS NULL OR ctx.schedule_version IS DISTINCT FROM NEW.availability_version OR ctx.time_zone IS DISTINCT FROM NEW.property_zone OR NEW.buffer_minutes<ctx.buffer_minutes OR TG_OP='UPDATE' AND NEW.buffer_minutes<OLD.buffer_minutes THEN RAISE EXCEPTION 'Current published viewing availability required' USING ERRCODE='23514';END IF;
 IF NOT viewing_slot_valid(NEW.listing_id,NEW.start_at,NEW.end_at,CASE WHEN TG_OP='UPDATE' THEN NEW.id ELSE NULL END,NEW.buffer_minutes) THEN RAISE EXCEPTION 'Viewing interval unavailable' USING ERRCODE='23P01';END IF;
 RETURN NEW;
END $$;
