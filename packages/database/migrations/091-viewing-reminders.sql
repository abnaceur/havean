CREATE TABLE viewing_reminders(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), viewing_id uuid NOT NULL REFERENCES viewings ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES profiles,booking_version int NOT NULL CHECK(booking_version>0),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','processing','failed','accepted','in_app','cancelled')),
 version int NOT NULL DEFAULT 1,due_at timestamptz NOT NULL,attempts int NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 payload jsonb,provider_message_id text,accepted_at timestamptz,error_code text,updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(viewing_id,booking_version)
);
CREATE INDEX viewing_reminders_due ON viewing_reminders(due_at) WHERE status IN('queued','processing','failed');
ALTER TABLE viewing_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY reminder_read ON viewing_reminders FOR SELECT USING(staff_scope());
CREATE POLICY reminder_service ON viewing_reminders FOR ALL USING(staff_scope()) WITH CHECK(staff_scope());
GRANT SELECT,INSERT,UPDATE,DELETE ON viewing_reminders TO haven_app;
ALTER TABLE notifications ADD COLUMN viewing_reminder_id uuid UNIQUE REFERENCES viewing_reminders ON DELETE SET NULL;
CREATE FUNCTION schedule_viewing_reminder() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 UPDATE viewing_reminders SET status='cancelled',version=version+1,updated_at=now(),error_code=NULL WHERE viewing_id=NEW.id AND (booking_version<>NEW.version OR NEW.status<>'confirmed') AND status IN('queued','processing','failed');
 IF NEW.status='confirmed' AND NEW.start_at>statement_timestamp() AND NEW.property_zone IS NOT NULL AND NEW.listing_version IS NOT NULL AND NEW.availability_version IS NOT NULL THEN
  INSERT INTO viewing_reminders(viewing_id,user_id,booking_version,due_at) VALUES(NEW.id,NEW.user_id,NEW.version,greatest(statement_timestamp(),NEW.start_at-interval '24 hours')) ON CONFLICT(viewing_id,booking_version) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION schedule_viewing_reminder() FROM PUBLIC;
CREATE TRIGGER viewing_reminder_schedule AFTER INSERT OR UPDATE ON viewings FOR EACH ROW EXECUTE FUNCTION schedule_viewing_reminder();
INSERT INTO viewing_reminders(viewing_id,user_id,booking_version,due_at) SELECT id,user_id,version,greatest(statement_timestamp(),start_at-interval '24 hours') FROM viewings WHERE status='confirmed' AND start_at>statement_timestamp() AND property_zone IS NOT NULL AND listing_version IS NOT NULL AND availability_version IS NOT NULL;

CREATE FUNCTION viewing_export_rows(professional boolean,stage text DEFAULT NULL,first_date date DEFAULT NULL,last_date date DEFAULT NULL) RETURNS TABLE(id uuid,listing_id uuid,agent_id uuid,start_at timestamptz,end_at timestamptz,status text,version int,title text,time_zone text,zone_source text,current_listing_version int,current_schedule_version int,buffer_minutes int) LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT v.id,v.listing_id,v.agent_id,v.start_at,v.end_at,v.status,v.version,CASE WHEN professional OR rental_listing_available(l.id) THEN l.title ELSE 'Unavailable property' END,coalesce(v.property_zone,ci.timezone),CASE WHEN v.property_zone IS NULL THEN 'current' ELSE 'recorded' END,l.version,policy.version,v.buffer_minutes
 FROM viewings v JOIN listings l ON l.id=v.listing_id JOIN units u ON u.id=l.unit_id JOIN communities co ON co.id=u.community_id JOIN districts d ON d.id=co.district_id JOIN cities ci ON ci.id=d.city_id LEFT JOIN viewing_availability policy ON policy.listing_id=l.id AND policy.agent_id=l.agent_id AND policy.time_zone=ci.timezone AND policy.status='active'
 WHERE EXISTS(SELECT 1 FROM profiles p WHERE p.id=actor_id() AND p.state='active') AND (CASE WHEN professional THEN professional_viewing_scope(v.id) ELSE v.user_id=actor_id() END) AND (stage IS NULL OR v.status=stage) AND (first_date IS NULL OR (v.start_at AT TIME ZONE coalesce(v.property_zone,ci.timezone))::date>=first_date) AND (last_date IS NULL OR (v.start_at AT TIME ZONE coalesce(v.property_zone,ci.timezone))::date<=last_date)
 ORDER BY v.start_at DESC,v.id LIMIT 10001
$$;
REVOKE ALL ON FUNCTION viewing_export_rows(boolean,text,date,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION viewing_export_rows(boolean,text,date,date) TO haven_app;
