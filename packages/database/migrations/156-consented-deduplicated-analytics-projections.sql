CREATE TABLE analytics_consent(user_id uuid PRIMARY KEY REFERENCES profiles,enabled boolean NOT NULL DEFAULT false,version int NOT NULL CHECK(version>0),updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE analytics_consent ENABLE ROW LEVEL SECURITY;
CREATE POLICY analytics_consent_owner ON analytics_consent USING(user_id=actor_id() AND EXISTS(SELECT 1 FROM profiles WHERE id=actor_id() AND state='active')) WITH CHECK(user_id=actor_id() AND EXISTS(SELECT 1 FROM profiles WHERE id=actor_id() AND state='active'));
CREATE FUNCTION analytics_consent_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF TG_OP='INSERT' AND NEW.version<>1 OR TG_OP='UPDATE' AND (NEW.user_id<>OLD.user_id OR NEW.version<>OLD.version+1 OR NEW.enabled=OLD.enabled) THEN RAISE EXCEPTION 'Current changed consent version required' USING ERRCODE='23514';END IF;RETURN NEW;END $$;
CREATE TRIGGER analytics_consent_version BEFORE INSERT OR UPDATE ON analytics_consent FOR EACH ROW EXECUTE FUNCTION analytics_consent_guard();
CREATE TABLE analytics_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),source_event_id uuid NOT NULL UNIQUE REFERENCES outbox,kind text NOT NULL CHECK(kind IN('listing_impression','listing_view','favorite_added','inquiry_submitted','viewing_requested','quote_requested')),city text NOT NULL,category text NOT NULL CHECK(category IN('resale','rent','commercial','new-homes','renovation')),dedup_key text NOT NULL UNIQUE,at timestamptz NOT NULL,projected_at timestamptz);
CREATE INDEX analytics_period ON analytics_events(at,city,category,kind);
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY analytics_admin_read ON analytics_events FOR SELECT USING(support_admin_actor(actor_id()));
CREATE TABLE analytics_daily(day date NOT NULL,city text NOT NULL,category text NOT NULL,kind text NOT NULL,count bigint NOT NULL CHECK(count>=0),PRIMARY KEY(day,city,category,kind));
ALTER TABLE analytics_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY analytics_daily_read ON analytics_daily FOR SELECT USING(support_admin_actor(actor_id()));
CREATE FUNCTION capture_consented_analytics() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE k text;target uuid;location text;cat text;subject uuid; BEGIN
 k:=CASE NEW.kind WHEN 'discovery.listing_impression' THEN 'listing_impression' WHEN 'discovery.listing_viewed' THEN 'listing_view' WHEN 'favorite.saved' THEN 'favorite_added' WHEN 'inquiry.submitted' THEN 'inquiry_submitted' WHEN 'viewing.requested' THEN 'viewing_requested' WHEN 'quote.requested' THEN 'quote_requested' END;
 IF k IS NULL THEN RETURN NEW;END IF;subject:=actor_id();IF subject IS NULL OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=subject AND state='active') THEN RETURN NEW;END IF;
 -- The established view endpoint requires explicit per-view consent. Other signals require durable opt-in.
 IF k<>'listing_view' AND NOT EXISTS(SELECT 1 FROM analytics_consent WHERE user_id=subject AND enabled) THEN RETURN NEW;END IF;
 target:=NEW.aggregate_id;
 IF k='inquiry_submitted' THEN SELECT resource_id INTO target FROM leads WHERE id=NEW.aggregate_id;ELSIF k='viewing_requested' THEN SELECT listing_id INTO target FROM viewings WHERE id=NEW.aggregate_id;END IF;
 IF k='quote_requested' THEN SELECT city,'renovation' INTO location,cat FROM quotes WHERE id=target;
 ELSE SELECT c.slug,CASE WHEN l.segment='commercial' THEN 'commercial' WHEN l.transaction='rent' THEN 'rent' ELSE 'resale' END INTO location,cat FROM listings l JOIN units u ON u.id=l.unit_id JOIN communities co ON co.id=u.community_id JOIN districts d ON d.id=co.district_id JOIN cities c ON c.id=d.city_id WHERE l.id=target;
 IF location IS NULL AND k='inquiry_submitted' THEN SELECT c.slug,'new-homes' INTO location,cat FROM developments p JOIN communities co ON co.id=p.community_id JOIN districts d ON d.id=co.district_id JOIN cities c ON c.id=d.city_id WHERE p.id=target;END IF;END IF;
 IF location IS NULL OR cat IS NULL THEN RETURN NEW;END IF;
 INSERT INTO analytics_events(source_event_id,kind,city,category,dedup_key,at) VALUES(NEW.id,k,location,cat,encode(sha256(convert_to(k||subject::text||CASE WHEN k IN('inquiry_submitted','viewing_requested','quote_requested') THEN NEW.aggregate_id::text ELSE target::text END||(NEW.created_at AT TIME ZONE 'UTC')::date::text,'UTF8')),'hex'),NEW.created_at) ON CONFLICT DO NOTHING;RETURN NEW;
END $$;
CREATE TRIGGER analytics_source_event AFTER INSERT ON outbox FOR EACH ROW EXECUTE FUNCTION capture_consented_analytics();
-- Projection consumes immutable source rows exactly once; retries never increment twice.
CREATE FUNCTION project_analytics_batch(batch_limit int DEFAULT 500) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE r record;n int:=0;BEGIN
 IF NOT support_admin_actor(actor_id()) THEN RAISE EXCEPTION 'Worker analytics projection required' USING ERRCODE='42501';END IF;
 FOR r IN SELECT * FROM analytics_events WHERE projected_at IS NULL ORDER BY at,id LIMIT LEAST(GREATEST(batch_limit,1),500) FOR UPDATE SKIP LOCKED LOOP
 INSERT INTO analytics_daily(day,city,category,kind,count) VALUES((r.at AT TIME ZONE 'UTC')::date,r.city,r.category,r.kind,1) ON CONFLICT(day,city,category,kind) DO UPDATE SET count=analytics_daily.count+1;
 UPDATE analytics_events SET projected_at=statement_timestamp() WHERE id=r.id;n:=n+1;END LOOP;RETURN n;
END $$;

CREATE FUNCTION analytics_event_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id IS DISTINCT FROM OLD.id OR NEW.source_event_id IS DISTINCT FROM OLD.source_event_id OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.city IS DISTINCT FROM OLD.city OR NEW.category IS DISTINCT FROM OLD.category OR NEW.dedup_key IS DISTINCT FROM OLD.dedup_key OR NEW.at IS DISTINCT FROM OLD.at OR OLD.projected_at IS NOT NULL OR NEW.projected_at IS DISTINCT FROM statement_timestamp() THEN RAISE EXCEPTION 'Immutable analytics source; single projection only' USING ERRCODE='23514';END IF;RETURN NEW;END $$;
CREATE TRIGGER analytics_event_guard BEFORE UPDATE ON analytics_events FOR EACH ROW EXECUTE FUNCTION analytics_event_immutable();
