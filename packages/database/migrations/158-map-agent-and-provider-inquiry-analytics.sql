ALTER TABLE analytics_events DROP CONSTRAINT analytics_events_category_check;
ALTER TABLE analytics_events ADD CONSTRAINT analytics_events_category_check CHECK(category IN('resale','rent','commercial','new-homes','renovation','agents'));
CREATE OR REPLACE FUNCTION capture_consented_analytics() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE k text;target uuid;location text;cat text;analytics_subject uuid;resource_kind text; BEGIN
 k:=CASE NEW.kind WHEN 'discovery.listing_impression' THEN 'listing_impression' WHEN 'discovery.listing_viewed' THEN 'listing_view' WHEN 'favorite.saved' THEN 'favorite_added' WHEN 'inquiry.submitted' THEN 'inquiry_submitted' WHEN 'viewing.requested' THEN 'viewing_requested' WHEN 'quote.requested' THEN 'quote_requested' END;
 IF k IS NULL THEN RETURN NEW;END IF;analytics_subject:=actor_id();IF analytics_subject IS NULL OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=analytics_subject AND state='active') THEN RETURN NEW;END IF;
 -- The established view endpoint requires explicit per-view consent. Other signals require durable opt-in.
 IF k<>'listing_view' AND NOT EXISTS(SELECT 1 FROM analytics_consent WHERE user_id=analytics_subject AND enabled) THEN RETURN NEW;END IF;
 target:=NEW.aggregate_id;
 IF k='inquiry_submitted' THEN SELECT resource_id,resource_type INTO target,resource_kind FROM leads WHERE id=NEW.aggregate_id;ELSIF k='viewing_requested' THEN SELECT listing_id INTO target FROM viewings WHERE id=NEW.aggregate_id;END IF;
 IF k='quote_requested' THEN SELECT city,'renovation' INTO location,cat FROM quotes WHERE id=target;
 ELSIF resource_kind IS NULL OR resource_kind='listing' THEN SELECT c.slug,CASE WHEN l.segment='commercial' THEN 'commercial' WHEN l.transaction='rent' THEN 'rent' ELSE 'resale' END INTO location,cat FROM listings l JOIN units u ON u.id=l.unit_id JOIN communities co ON co.id=u.community_id JOIN districts d ON d.id=co.district_id JOIN cities c ON c.id=d.city_id WHERE l.id=target;
 END IF;
 IF location IS NULL AND resource_kind='development' THEN SELECT c.slug,'new-homes' INTO location,cat FROM developments p JOIN communities co ON co.id=p.community_id JOIN districts d ON d.id=co.district_id JOIN cities c ON c.id=d.city_id WHERE p.id=target;
 ELSIF location IS NULL AND resource_kind='agent' THEN SELECT city,'agents' INTO location,cat FROM agents WHERE id=target;
 ELSIF location IS NULL AND resource_kind='provider' THEN SELECT city,'renovation' INTO location,cat FROM providers WHERE id=target;END IF;
 IF location IS NULL OR cat IS NULL THEN RETURN NEW;END IF;
 INSERT INTO analytics_events(source_event_id,kind,city,category,dedup_key,at) VALUES(NEW.id,k,location,cat,encode(sha256(convert_to(k||analytics_subject::text||CASE WHEN k IN('inquiry_submitted','viewing_requested','quote_requested') THEN NEW.aggregate_id::text ELSE target::text END||(NEW.created_at AT TIME ZONE 'UTC')::date::text,'UTF8')),'hex'),NEW.created_at) ON CONFLICT DO NOTHING;RETURN NEW;
END $$;
