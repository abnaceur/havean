CREATE FUNCTION viewing_local_instant(local_value timestamp,zone text) RETURNS timestamptz LANGUAGE sql STABLE STRICT AS $$
 SELECT CASE WHEN ((local_value AT TIME ZONE zone) AT TIME ZONE zone)=local_value THEN local_value AT TIME ZONE zone ELSE NULL END
$$;
CREATE TABLE viewing_availability(listing_id uuid PRIMARY KEY REFERENCES listings,agent_id uuid NOT NULL REFERENCES agents,organization_id uuid NOT NULL REFERENCES organizations,time_zone text NOT NULL,version int NOT NULL DEFAULT 1 CHECK(version>0),status text NOT NULL CHECK(status IN('active','paused')),duration_minutes int NOT NULL CHECK(duration_minutes BETWEEN 15 AND 120 AND duration_minutes%15=0),buffer_minutes int NOT NULL CHECK(buffer_minutes BETWEEN 0 AND 120 AND buffer_minutes%5=0),weekdays int[] NOT NULL CHECK(cardinality(weekdays) BETWEEN 1 AND 7 AND weekdays<@ARRAY[0,1,2,3,4,5,6]),opens_at time NOT NULL,closes_at time NOT NULL,CHECK(closes_at>opens_at AND extract(epoch FROM closes_at-opens_at)/60>=duration_minutes),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE viewing_availability_blocks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),listing_id uuid NOT NULL REFERENCES viewing_availability ON DELETE CASCADE,agent_id uuid NOT NULL REFERENCES agents,organization_id uuid NOT NULL REFERENCES organizations,version int NOT NULL DEFAULT 1 CHECK(version>0),status text NOT NULL DEFAULT 'active' CHECK(status IN('active','cancelled')),start_at timestamptz NOT NULL,end_at timestamptz NOT NULL,reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 2 AND 300),created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),CHECK(end_at>start_at));
CREATE INDEX viewing_blocks_agent_period ON viewing_availability_blocks USING gist(agent_id,tstzrange(start_at,end_at,'[)')) WHERE status='active';
CREATE FUNCTION viewing_schedule_scope(p_listing uuid,p_agent uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM listings l JOIN agents a ON a.id=p_agent AND a.organization_id=l.organization_id JOIN organizations o ON o.id=l.organization_id AND o.type='agency' JOIN memberships m ON m.organization_id=o.id AND m.user_id=actor_id() AND m.status='active' JOIN profiles p ON p.id=m.user_id AND p.state='active' WHERE l.id=p_listing AND l.organization_id=org_id() AND l.agent_id=p_agent AND (m.role IN('agency_manager','admin') OR m.role='agent' AND a.user_id=actor_id()))
$$;
REVOKE ALL ON FUNCTION viewing_schedule_scope(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION viewing_schedule_scope(uuid,uuid) TO haven_app;
CREATE FUNCTION viewing_current_schedule_scope(p_listing uuid,p_organization uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM listings l WHERE l.id=p_listing AND l.organization_id=p_organization AND viewing_schedule_scope(l.id,l.agent_id))
$$;
CREATE FUNCTION viewing_agency_manager(p_organization uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT p_organization=org_id() AND EXISTS(SELECT 1 FROM memberships m JOIN profiles p ON p.id=m.user_id AND p.state='active' JOIN organizations o ON o.id=m.organization_id AND o.type='agency' WHERE m.organization_id=p_organization AND m.user_id=actor_id() AND m.status='active' AND m.role IN('agency_manager','admin'))
$$;
REVOKE ALL ON FUNCTION viewing_current_schedule_scope(uuid,uuid),viewing_agency_manager(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION viewing_current_schedule_scope(uuid,uuid),viewing_agency_manager(uuid) TO haven_app;
ALTER TABLE viewing_availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY viewing_schedule_read ON viewing_availability FOR SELECT USING(staff_scope() OR viewing_current_schedule_scope(listing_id,organization_id));
CREATE POLICY viewing_schedule_insert ON viewing_availability FOR INSERT WITH CHECK(organization_id=org_id() AND viewing_schedule_scope(listing_id,agent_id));
CREATE POLICY viewing_schedule_update ON viewing_availability FOR UPDATE USING(viewing_current_schedule_scope(listing_id,organization_id)) WITH CHECK(organization_id=org_id() AND viewing_schedule_scope(listing_id,agent_id));
ALTER TABLE viewing_availability_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY viewing_block_read ON viewing_availability_blocks FOR SELECT USING(staff_scope() OR organization_id=org_id() AND (viewing_schedule_scope(listing_id,agent_id) OR viewing_agency_manager(organization_id)));
CREATE POLICY viewing_block_insert ON viewing_availability_blocks FOR INSERT WITH CHECK(organization_id=org_id() AND created_by=actor_id() AND status='active' AND version=1 AND viewing_schedule_scope(listing_id,agent_id));
CREATE POLICY viewing_block_cancel ON viewing_availability_blocks FOR UPDATE USING(status='active' AND organization_id=org_id() AND (viewing_schedule_scope(listing_id,agent_id) OR viewing_agency_manager(organization_id))) WITH CHECK(status='cancelled' AND organization_id=org_id() AND (viewing_schedule_scope(listing_id,agent_id) OR viewing_agency_manager(organization_id)));
CREATE FUNCTION public_viewing_schedule(target uuid) RETURNS TABLE(listing_version int,agent_id uuid,time_zone text,schedule_version int,duration_minutes int,buffer_minutes int) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE l listings%ROWTYPE;zone text;policy viewing_availability%ROWTYPE;eligible uuid;
BEGIN
 SELECT * INTO l FROM listings WHERE id=target AND rental_listing_available(id) FOR SHARE;
 IF NOT FOUND THEN RETURN;END IF;
 SELECT ci.timezone INTO zone FROM units u JOIN communities co ON co.id=u.community_id JOIN districts d ON d.id=co.district_id JOIN cities ci ON ci.id=d.city_id WHERE u.id=l.unit_id;
 SELECT a.id INTO eligible FROM public_listing_agents(target) a LIMIT 1;
 SELECT * INTO policy FROM viewing_availability v WHERE v.listing_id=target AND v.agent_id=eligible AND v.time_zone=zone AND v.status='active' FOR SHARE;
 RETURN QUERY SELECT l.version,eligible,zone,policy.version,policy.duration_minutes,policy.buffer_minutes;
END $$;
CREATE FUNCTION public_viewing_slot_rows(target uuid,first_date date DEFAULT NULL,day_count int DEFAULT 7) RETURNS TABLE(start_at timestamptz,end_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE policy viewing_availability%ROWTYPE;first_day date;zone text;
BEGIN
 IF day_count IS NULL OR day_count NOT BETWEEN 1 AND 7 THEN RAISE EXCEPTION 'Invalid viewing date range' USING ERRCODE='23514';END IF;
 SELECT s.time_zone INTO zone FROM public_viewing_schedule(target) s WHERE s.schedule_version IS NOT NULL;
 IF zone IS NULL THEN RETURN;END IF;
 SELECT * INTO policy FROM viewing_availability v WHERE v.listing_id=target FOR SHARE;
 first_day:=coalesce(first_date,(statement_timestamp() AT TIME ZONE zone)::date);
 RETURN QUERY WITH days AS (SELECT (first_day+n)::date local_day FROM generate_series(0,day_count-1) n),local_candidates AS (
 SELECT slot.local_start FROM days d CROSS JOIN LATERAL generate_series(d.local_day+policy.opens_at,d.local_day+policy.closes_at-make_interval(mins=>policy.duration_minutes),interval '15 minutes') slot(local_start) WHERE extract(dow FROM d.local_day)::int=ANY(policy.weekdays)
 ),utc_candidates AS (SELECT viewing_local_instant(c.local_start,zone) starts,viewing_local_instant(c.local_start+make_interval(mins=>policy.duration_minutes),zone) ends FROM local_candidates c)
 SELECT c.starts,c.ends FROM utc_candidates c WHERE c.starts>statement_timestamp() AND c.ends-c.starts=make_interval(mins=>policy.duration_minutes)
 AND NOT EXISTS(SELECT 1 FROM viewing_availability_blocks b WHERE b.agent_id=policy.agent_id AND b.status='active' AND tstzrange(b.start_at,b.end_at,'[)')&&tstzrange(c.starts-make_interval(mins=>policy.buffer_minutes),c.ends+make_interval(mins=>policy.buffer_minutes),'[)'))
 AND NOT EXISTS(SELECT 1 FROM viewings v WHERE v.agent_id=policy.agent_id AND v.status IN('requested','confirmed') AND tstzrange(v.start_at,v.end_at,'[)')&&tstzrange(c.starts-make_interval(mins=>policy.buffer_minutes),c.ends+make_interval(mins=>policy.buffer_minutes),'[)'))
 ORDER BY c.starts LIMIT 200;
END $$;
REVOKE ALL ON FUNCTION public_viewing_schedule(uuid),public_viewing_slot_rows(uuid,date,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_viewing_schedule(uuid),public_viewing_slot_rows(uuid,date,int) TO haven_app;
