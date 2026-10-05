CREATE TABLE projection_versions(
 aggregate_id uuid NOT NULL,projection text NOT NULL,source_version integer NOT NULL,
 tombstone boolean NOT NULL DEFAULT false,updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(aggregate_id,projection)
);
CREATE TABLE outbox_effects(
 event_id uuid NOT NULL REFERENCES outbox,consumer text NOT NULL,
 source_version integer,completed_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(event_id,consumer)
);
ALTER TABLE notifications ADD COLUMN source_event_id uuid UNIQUE REFERENCES outbox;
ALTER TABLE projection_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_effects ENABLE ROW LEVEL SECURITY;
CREATE POLICY projection_worker_scope ON projection_versions USING(staff_scope()) WITH CHECK(staff_scope());
CREATE POLICY effect_worker_scope ON outbox_effects USING(staff_scope()) WITH CHECK(staff_scope());
