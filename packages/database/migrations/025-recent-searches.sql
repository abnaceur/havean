CREATE TABLE recent_searches(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES profiles,
 city text NOT NULL REFERENCES cities(slug),query text NOT NULL CHECK(length(query) BETWEEN 1 AND 120),
 version int NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,city,query)
);
ALTER TABLE recent_searches ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_recent_searches ON recent_searches USING(user_id=actor_id()) WITH CHECK(user_id=actor_id());
CREATE INDEX recent_searches_user_city ON recent_searches(user_id,city,updated_at DESC,id);
