CREATE TABLE notification_preferences(
 user_id uuid PRIMARY KEY REFERENCES profiles,
 email_enabled boolean NOT NULL DEFAULT false,
 in_app_enabled boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 1 CHECK(version>0)
);
CREATE TABLE alert_digests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES profiles,
 search_id uuid NOT NULL REFERENCES saved_searches,search_version integer NOT NULL,
 cadence text NOT NULL CHECK(cadence IN('daily','weekly')),period_start date NOT NULL,
 due_at timestamptz NOT NULL,status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','processing','accepted','in_app','failed','cancelled')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 payload jsonb,provider_message_id text,acceptance_recorded_at timestamptz,
 error_code text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(search_id,cadence,period_start)
);
CREATE TABLE alert_digest_items(
 search_id uuid NOT NULL REFERENCES saved_searches,listing_id uuid NOT NULL REFERENCES listings,
 digest_id uuid NOT NULL REFERENCES alert_digests,listing_version integer NOT NULL,
 PRIMARY KEY(search_id,listing_id)
);
CREATE TABLE alert_plan_events(
 event_id uuid PRIMARY KEY REFERENCES outbox,version integer NOT NULL DEFAULT 1 CHECK(version=1),
 planned_count integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE notifications ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE notifications ADD COLUMN alert_digest_id uuid UNIQUE REFERENCES alert_digests;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_notification_preferences ON notification_preferences
 USING(user_id=actor_id() OR staff_scope()) WITH CHECK(user_id=actor_id() OR staff_scope());
ALTER TABLE alert_digests ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_alert_digests ON alert_digests FOR SELECT USING(user_id=actor_id() OR staff_scope());
CREATE POLICY system_alert_digests ON alert_digests FOR ALL USING(staff_scope()) WITH CHECK(staff_scope());
ALTER TABLE alert_digest_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_alert_items ON alert_digest_items FOR SELECT USING(digest_id IN(SELECT id FROM alert_digests));
CREATE POLICY system_alert_items ON alert_digest_items FOR ALL USING(staff_scope()) WITH CHECK(staff_scope());
ALTER TABLE alert_plan_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY system_alert_plans ON alert_plan_events USING(staff_scope()) WITH CHECK(staff_scope());
CREATE INDEX due_alert_digests ON alert_digests(due_at) WHERE status IN('queued','processing','failed');
