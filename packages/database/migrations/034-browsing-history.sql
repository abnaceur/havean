CREATE TABLE browsing_history_settings(
 user_id uuid PRIMARY KEY REFERENCES profiles,
 enabled boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 1 CHECK(version>0)
);
CREATE TABLE browsing_history(
 user_id uuid NOT NULL REFERENCES profiles,
 listing_id uuid NOT NULL REFERENCES listings,
 viewed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,listing_id)
);
ALTER TABLE browsing_history_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE browsing_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_history_settings ON browsing_history_settings
 USING(user_id=actor_id() OR staff_scope()) WITH CHECK(user_id=actor_id() OR staff_scope());
CREATE POLICY own_history ON browsing_history
 USING(user_id=actor_id() OR staff_scope()) WITH CHECK(user_id=actor_id() OR staff_scope());
CREATE POLICY history_consent ON browsing_history AS RESTRICTIVE FOR INSERT
 WITH CHECK(EXISTS(SELECT 1 FROM browsing_history_settings s WHERE s.user_id=browsing_history.user_id AND s.enabled)
 AND EXISTS(SELECT 1 FROM public_listings p WHERE p.id=listing_id));
CREATE POLICY history_still_consented ON browsing_history AS RESTRICTIVE FOR UPDATE
 WITH CHECK(EXISTS(SELECT 1 FROM browsing_history_settings s WHERE s.user_id=browsing_history.user_id AND s.enabled)
 AND EXISTS(SELECT 1 FROM public_listings p WHERE p.id=listing_id));
