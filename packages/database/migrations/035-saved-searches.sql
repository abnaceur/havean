ALTER TABLE saved_searches ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE saved_searches ADD COLUMN criteria_version integer NOT NULL DEFAULT 0 CHECK(criteria_version>=0);
ALTER TABLE saved_searches ADD COLUMN paused boolean NOT NULL DEFAULT true;
ALTER TABLE saved_searches ADD COLUMN deleted_at timestamptz;
ALTER TABLE saved_searches ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
-- Legacy unvalidated criteria stay paused until an explicit normalized edit.
-- Deletion retains a tombstone, protecting stale edits and future alert dedupe.
