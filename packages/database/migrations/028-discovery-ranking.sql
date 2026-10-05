CREATE TABLE listing_view_events(
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES profiles,listing_id uuid NOT NULL REFERENCES listings,
 listing_version int NOT NULL CHECK(listing_version>0),recorded_at timestamptz NOT NULL DEFAULT now(),
 view_day date GENERATED ALWAYS AS((recorded_at AT TIME ZONE 'UTC')::date) STORED,
 UNIQUE(user_id,listing_id,view_day)
);
CREATE INDEX listing_view_period ON listing_view_events(listing_id,view_day);
ALTER TABLE listing_view_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY view_signal_read ON listing_view_events FOR SELECT USING(user_id=actor_id() OR staff_scope());
CREATE POLICY view_signal_insert ON listing_view_events FOR INSERT WITH CHECK((user_id=actor_id() OR staff_scope()) AND EXISTS(SELECT 1 FROM public_listings p WHERE p.id=listing_id AND p.version=listing_version));
CREATE POLICY view_signal_cleanup ON listing_view_events FOR DELETE USING(staff_scope());
CREATE TABLE curated_boosts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),resource_type text NOT NULL CHECK(resource_type IN('listing','development')),resource_id uuid NOT NULL,
 city text NOT NULL REFERENCES cities(slug),points int NOT NULL CHECK(points BETWEEN 0 AND 100),sponsored boolean NOT NULL DEFAULT false,
 public_label text NOT NULL CHECK(length(public_label) BETWEEN 1 AND 80),starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL CHECK(ends_at>starts_at),
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','paused')),version int NOT NULL DEFAULT 1,
 created_by uuid NOT NULL REFERENCES profiles,updated_by uuid NOT NULL REFERENCES profiles,updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(resource_type,resource_id)
);
ALTER TABLE curated_boosts ENABLE ROW LEVEL SECURITY;
CREATE POLICY boost_editor ON curated_boosts USING(staff_scope() OR current_setting('app.editor',true)='true') WITH CHECK(staff_scope() OR current_setting('app.editor',true)='true');
-- Public read ports return only aggregate/public scoring data, never private
-- signal identities or editorial actor information. Unavailable targets return zero/null.
CREATE FUNCTION public_listing_view_count(target uuid,since_day date) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN EXISTS(SELECT 1 FROM public_listings WHERE id=target) THEN(SELECT count(*)::int FROM listing_view_events WHERE listing_id=target AND view_day>=GREATEST(since_day,(now() AT TIME ZONE 'UTC')::date-29) AND view_day<=(now() AT TIME ZONE 'UTC')::date) ELSE 0 END
$$;
CREATE FUNCTION public_curated_boost(kind text,target uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('points',b.points,'sponsored',b.sponsored,'label',b.public_label) FROM curated_boosts b
 WHERE b.resource_type=kind AND b.resource_id=target AND b.status='active' AND b.starts_at<=now() AND b.ends_at>now()
 AND ((kind='listing' AND EXISTS(SELECT 1 FROM public_listings p WHERE p.id=target AND p.city=b.city)) OR (kind='development' AND EXISTS(SELECT 1 FROM developments de JOIN communities co ON co.id=de.community_id JOIN districts d ON d.id=co.district_id JOIN cities ci ON ci.id=d.city_id WHERE de.id=target AND ci.slug=b.city AND de.status IN('on_sale','coming_soon'))))
$$;
