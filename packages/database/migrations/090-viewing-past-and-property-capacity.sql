-- Add property capacity without changing or cancelling historical reservations.
ALTER TABLE viewings ADD CONSTRAINT viewing_property_interval_exclusion EXCLUDE USING gist(listing_id WITH =,tstzrange(start_at,end_at,'[)') WITH &&) WHERE(status IN('requested','confirmed'));
CREATE FUNCTION viewing_past_reschedule_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT staff_scope() AND (NEW.start_at,NEW.end_at) IS DISTINCT FROM (OLD.start_at,OLD.end_at) AND OLD.end_at<=statement_timestamp() THEN RAISE EXCEPTION 'Ended viewings cannot be rescheduled' USING ERRCODE='23514';END IF;RETURN NEW;
END $$;
CREATE TRIGGER viewing_past_reschedule_authority BEFORE UPDATE ON viewings FOR EACH ROW EXECUTE FUNCTION viewing_past_reschedule_guard();
CREATE OR REPLACE FUNCTION viewing_slot_valid(target uuid,starts timestamptz,ends timestamptz,skip_id uuid DEFAULT NULL,retained_gap int DEFAULT 0) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE policy viewing_availability%ROWTYPE;local_start timestamp;local_end timestamp;gap int;
BEGIN
 SELECT * INTO policy FROM viewing_availability v WHERE v.listing_id=target AND v.status='active';IF NOT FOUND THEN RETURN false;END IF;
 IF NOT EXISTS(SELECT 1 FROM public_listings l JOIN public_listing_agents(target) a ON a.id=policy.agent_id JOIN cities ci ON ci.slug=l.city WHERE l.id=target AND ci.timezone=policy.time_zone) THEN RETURN false;END IF;
 local_start:=starts AT TIME ZONE policy.time_zone;local_end:=local_start+make_interval(mins=>policy.duration_minutes);gap:=greatest(policy.buffer_minutes,retained_gap);
 IF starts IS NULL OR ends IS NULL OR starts<=statement_timestamp() OR viewing_local_instant(local_start,policy.time_zone) IS DISTINCT FROM starts OR viewing_local_instant(local_end,policy.time_zone) IS DISTINCT FROM ends OR ends-starts<>make_interval(mins=>policy.duration_minutes) OR NOT(extract(dow FROM local_start)::int=ANY(policy.weekdays)) OR local_start::time<policy.opens_at OR local_end::date<>local_start::date OR local_end::time>policy.closes_at OR mod(extract(epoch FROM local_start::time-policy.opens_at)::numeric,900)<>0 THEN RETURN false;END IF;
 RETURN NOT EXISTS(SELECT 1 FROM viewing_availability_blocks b WHERE b.agent_id=policy.agent_id AND b.status='active' AND tstzrange(b.start_at,b.end_at,'[)')&&tstzrange(starts-make_interval(mins=>gap),ends+make_interval(mins=>gap),'[)'))
 AND NOT EXISTS(SELECT 1 FROM viewings v WHERE v.listing_id=target AND v.status IN('requested','confirmed') AND v.id IS DISTINCT FROM skip_id AND tstzrange(v.start_at,v.end_at,'[)')&&tstzrange(starts,ends,'[)'))
 AND NOT EXISTS(SELECT 1 FROM viewings v WHERE v.agent_id=policy.agent_id AND v.status IN('requested','confirmed') AND v.id IS DISTINCT FROM skip_id AND tstzrange(v.start_at,v.end_at,'[)')&&tstzrange(starts-make_interval(mins=>greatest(gap,v.buffer_minutes)),ends+make_interval(mins=>greatest(gap,v.buffer_minutes)),'[)'));
END $$;
