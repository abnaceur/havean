CREATE FUNCTION content_editor_actor(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM profiles p JOIN memberships m ON m.user_id=p.id WHERE p.id=target AND p.state='active' AND m.organization_id IS NULL AND m.status='active' AND m.role IN('editor','admin')) $$;
CREATE FUNCTION content_editor_lock() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN PERFORM 1 FROM profiles WHERE id=actor_id() AND state='active' FOR SHARE;IF NOT FOUND THEN RETURN false;END IF;PERFORM 1 FROM memberships WHERE user_id=actor_id() AND organization_id IS NULL AND status='active' AND role IN('editor','admin') FOR SHARE;RETURN FOUND;END $$;
CREATE TABLE home_taxonomy(city text NOT NULL REFERENCES cities(slug),category text NOT NULL CHECK(category IN('buy','rent','new-homes','commercial')),label text NOT NULL CHECK(length(btrim(label)) BETWEEN 2 AND 60),active boolean NOT NULL DEFAULT true,version int NOT NULL DEFAULT 1 CHECK(version>0),updated_by uuid REFERENCES profiles,updated_at timestamptz,PRIMARY KEY(city,category));
INSERT INTO home_taxonomy(city,category,label) SELECT c.slug,k.category,k.label FROM cities c CROSS JOIN (VALUES('buy','Homes for sale'),('rent','Rentals'),('new-homes','New developments'),('commercial','Commercial property')) k(category,label);
CREATE TABLE home_sections(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),city text NOT NULL REFERENCES cities(slug),category text NOT NULL CHECK(category IN('buy','rent','new-homes','commercial')),title text NOT NULL CHECK(length(btrim(title)) BETWEEN 5 AND 100),copy text NOT NULL CHECK(length(btrim(copy)) BETWEEN 5 AND 300),position int NOT NULL CHECK(position BETWEEN 1 AND 100),starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL CHECK(ends_at>starts_at),items jsonb NOT NULL CHECK(jsonb_typeof(items)='array' AND jsonb_array_length(items) BETWEEN 1 AND 6),state text NOT NULL DEFAULT 'draft' CHECK(state IN('draft','published','archived')),published jsonb,version int NOT NULL DEFAULT 1 CHECK(version>0),last_action text,created_by uuid NOT NULL REFERENCES profiles,updated_by uuid NOT NULL REFERENCES profiles,created_at timestamptz NOT NULL DEFAULT statement_timestamp(),updated_at timestamptz NOT NULL DEFAULT statement_timestamp());
CREATE TABLE home_content_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),section_id uuid NOT NULL REFERENCES home_sections,version int NOT NULL CHECK(version>0),action text NOT NULL,actor_id uuid NOT NULL REFERENCES profiles,at timestamptz NOT NULL,snapshot jsonb NOT NULL,UNIQUE(section_id,version));
CREATE TABLE home_taxonomy_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),city text NOT NULL,category text NOT NULL,version int NOT NULL,actor_id uuid NOT NULL REFERENCES profiles,at timestamptz NOT NULL,snapshot jsonb NOT NULL,UNIQUE(city,category,version),FOREIGN KEY(city,category) REFERENCES home_taxonomy);
ALTER TABLE home_sections ENABLE ROW LEVEL SECURITY;ALTER TABLE home_taxonomy ENABLE ROW LEVEL SECURITY;ALTER TABLE home_content_history ENABLE ROW LEVEL SECURITY;ALTER TABLE home_taxonomy_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY home_section_editor ON home_sections USING(content_editor_actor(actor_id())) WITH CHECK(content_editor_actor(actor_id()));
CREATE POLICY home_taxonomy_editor ON home_taxonomy USING(content_editor_actor(actor_id())) WITH CHECK(content_editor_actor(actor_id()));
CREATE POLICY home_section_history_read ON home_content_history FOR SELECT USING(content_editor_actor(actor_id()));
CREATE POLICY home_section_history_append ON home_content_history FOR INSERT WITH CHECK(content_editor_actor(actor_id()) AND actor_id=actor_id());
CREATE POLICY home_taxonomy_history_read ON home_taxonomy_history FOR SELECT USING(content_editor_actor(actor_id()));
CREATE POLICY home_taxonomy_history_append ON home_taxonomy_history FOR INSERT WITH CHECK(content_editor_actor(actor_id()) AND actor_id=actor_id());
CREATE TRIGGER home_content_history_immutable BEFORE UPDATE OR DELETE ON home_content_history FOR EACH ROW EXECUTE FUNCTION lease_history_guard();
CREATE TRIGGER home_taxonomy_history_immutable BEFORE UPDATE OR DELETE ON home_taxonomy_history FOR EACH ROW EXECUTE FUNCTION lease_history_guard();
CREATE FUNCTION content_source(target uuid,rev int,market text,kind text,locking boolean DEFAULT false) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF locking AND NOT content_editor_lock() THEN RETURN false;END IF;
 IF kind='new-homes' THEN
  IF locking THEN PERFORM 1 FROM developments WHERE id=target FOR SHARE;END IF;
  RETURN EXISTS(SELECT 1 FROM developments de JOIN communities co ON co.id=de.community_id JOIN districts d ON d.id=co.district_id JOIN cities ci ON ci.id=d.city_id WHERE de.id=target AND de.version=rev AND ci.slug=market AND ci.status='active' AND d.status='active' AND co.status='active' AND de.currency=ci.currency AND de.status IN('coming_soon','on_sale'));
 END IF;
 IF locking THEN PERFORM 1 FROM listings WHERE id=target FOR SHARE;END IF;
 RETURN EXISTS(SELECT 1 FROM public_listings p JOIN cities ci ON ci.slug=p.city WHERE p.id=target AND p.version=rev AND p.city=market AND ci.status='active' AND p.currency=ci.currency AND (kind='buy' AND p.transaction='sale' AND p.segment='residential' OR kind='rent' AND p.transaction='rent' AND p.segment='residential' OR kind='commercial' AND p.segment='commercial'));
END $$;
CREATE FUNCTION home_section_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE selection jsonb;expected jsonb;
BEGIN
 IF current_user<>'haven_app' THEN RETURN NEW;END IF;
 IF TG_OP='DELETE' OR NOT content_editor_lock() THEN RAISE EXCEPTION 'Current editor and retained content required' USING ERRCODE='23514';END IF;
 IF NEW.updated_by IS DISTINCT FROM actor_id() OR NEW.updated_at IS DISTINCT FROM statement_timestamp() THEN RAISE EXCEPTION 'Exact content actor/time required' USING ERRCODE='23514';END IF;
 IF NOT EXISTS(SELECT 1 FROM cities WHERE slug=NEW.city AND status='active') THEN RAISE EXCEPTION 'Active content city required' USING ERRCODE='23514';END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.version<>1 OR NEW.state<>'draft' OR NEW.published IS NOT NULL OR NEW.last_action IS DISTINCT FROM 'created' OR NEW.created_by IS DISTINCT FROM actor_id() OR NEW.created_at IS DISTINCT FROM statement_timestamp() THEN RAISE EXCEPTION 'New editor draft required' USING ERRCODE='23514';END IF;
 ELSE
  IF NEW.version<>OLD.version+1 OR NEW.city IS DISTINCT FROM OLD.city OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at OR OLD.state='archived' THEN RAISE EXCEPTION 'Current content version and original city required' USING ERRCODE='23514';END IF;
  IF NEW.last_action='edited' THEN
   IF NEW.state IS DISTINCT FROM OLD.state OR NEW.published IS DISTINCT FROM OLD.published THEN RAISE EXCEPTION 'Draft edit cannot publish' USING ERRCODE='23514';END IF;
  ELSIF NEW.last_action IN('published','archived') THEN
   IF (to_jsonb(NEW)-ARRAY['version','state','published','last_action','updated_by','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['version','state','published','last_action','updated_by','updated_at']) THEN RAISE EXCEPTION 'Publish/archive original draft required' USING ERRCODE='23514';END IF;
   IF NEW.last_action='archived' AND (NEW.state<>'archived' OR NEW.published IS DISTINCT FROM OLD.published) THEN RAISE EXCEPTION 'Retain archived publication required' USING ERRCODE='23514';END IF;
  ELSE RAISE EXCEPTION 'Explicit content action required' USING ERRCODE='23514';END IF;
 END IF;
 IF NEW.last_action IN('created','edited','published') THEN
  PERFORM 1 FROM home_taxonomy WHERE city=NEW.city AND category=NEW.category AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active editorial category required' USING ERRCODE='23514';END IF;
  IF (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(NEW.items) x)<>jsonb_array_length(NEW.items) THEN RAISE EXCEPTION 'Unique selections required' USING ERRCODE='23514';END IF;
  FOR selection IN SELECT * FROM jsonb_array_elements(NEW.items) LOOP
   IF NOT content_source((selection->>'id')::uuid,(selection->>'version')::int,NEW.city,NEW.category,true) THEN RAISE EXCEPTION 'Current eligible same-city/category content required' USING ERRCODE='23514';END IF;
  END LOOP;
 END IF;
 IF NEW.last_action='published' THEN
  expected:=jsonb_build_object('city',NEW.city,'category',NEW.category,'title',NEW.title,'copy',NEW.copy,'position',NEW.position,'startsAt',to_char(NEW.starts_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'endsAt',to_char(NEW.ends_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'items',NEW.items,'version',NEW.version);
  IF NEW.state<>'published' OR NEW.published IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Exact versioned publication snapshot required' USING ERRCODE='23514';END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER home_section_admission BEFORE INSERT OR UPDATE OR DELETE ON home_sections FOR EACH ROW EXECUTE FUNCTION home_section_guard();
CREATE FUNCTION home_taxonomy_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$ BEGIN
 IF current_user<>'haven_app' THEN RETURN NEW;END IF;
 IF TG_OP='DELETE' OR NOT content_editor_lock() OR NEW.updated_by IS DISTINCT FROM actor_id() OR NEW.updated_at IS DISTINCT FROM statement_timestamp() THEN RAISE EXCEPTION 'Current taxonomy actor/time required' USING ERRCODE='23514';END IF;
 IF TG_OP='INSERT' AND NEW.version<>1 OR TG_OP='UPDATE' AND (NEW.version<>OLD.version+1 OR NEW.city IS DISTINCT FROM OLD.city OR NEW.category IS DISTINCT FROM OLD.category) THEN RAISE EXCEPTION 'Versioned original taxonomy key required' USING ERRCODE='23514';END IF;RETURN NEW;
END $$;
CREATE TRIGGER home_taxonomy_admission BEFORE INSERT OR UPDATE OR DELETE ON home_taxonomy FOR EACH ROW EXECUTE FUNCTION home_taxonomy_guard();
CREATE FUNCTION home_content_history_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$ BEGIN
 IF current_user<>'haven_app' THEN RETURN NEW;END IF;
 IF NOT content_editor_lock() OR NOT EXISTS(SELECT 1 FROM home_sections s WHERE s.id=NEW.section_id AND s.version=NEW.version AND s.updated_by=NEW.actor_id AND s.updated_at=NEW.at AND s.last_action=NEW.action AND to_jsonb(s)=NEW.snapshot) THEN RAISE EXCEPTION 'Exact immutable content activity required' USING ERRCODE='23514';END IF;RETURN NEW;
END $$;
CREATE TRIGGER home_content_history_admission BEFORE INSERT ON home_content_history FOR EACH ROW EXECUTE FUNCTION home_content_history_guard();
CREATE FUNCTION public_home_sections(market text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'published',s.published) ORDER BY (s.published->>'position')::int,s.id),'[]') FROM home_sections s JOIN home_taxonomy t ON t.city=s.city AND t.category=s.published->>'category' AND t.active JOIN cities ci ON ci.slug=s.city AND ci.status='active' WHERE s.city=market AND s.state='published' AND (s.published->>'startsAt')::timestamptz<=now() AND (s.published->>'endsAt')::timestamptz>now()
$$;
REVOKE ALL ON FUNCTION content_editor_actor(uuid),content_editor_lock(),content_source(uuid,int,text,text,boolean),public_home_sections(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION content_editor_actor(uuid),content_editor_lock(),content_source(uuid,int,text,text,boolean),public_home_sections(text) TO haven_app;
CREATE INDEX home_section_city_state ON home_sections(city,state);
CREATE FUNCTION home_taxonomy_history_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$ BEGIN
 IF current_user<>'haven_app' THEN RETURN NEW;END IF;
 IF NOT content_editor_lock() OR NOT EXISTS(SELECT 1 FROM home_taxonomy t WHERE t.city=NEW.city AND t.category=NEW.category AND t.version=NEW.version AND t.updated_by=NEW.actor_id AND t.updated_at=NEW.at AND to_jsonb(t)=NEW.snapshot) THEN RAISE EXCEPTION 'Exact taxonomy history required' USING ERRCODE='23514';END IF;RETURN NEW;
END $$;
CREATE TRIGGER home_taxonomy_history_admission BEFORE INSERT ON home_taxonomy_history FOR EACH ROW EXECUTE FUNCTION home_taxonomy_history_guard();
CREATE FUNCTION home_editor_history_record() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$ BEGIN
 IF current_user<>'haven_app' THEN RETURN NEW;END IF;
 IF TG_TABLE_NAME='home_sections' THEN INSERT INTO home_content_history(section_id,version,action,actor_id,at,snapshot) VALUES(NEW.id,NEW.version,NEW.last_action,NEW.updated_by,NEW.updated_at,to_jsonb(NEW));
 ELSE INSERT INTO home_taxonomy_history(city,category,version,actor_id,at,snapshot) VALUES(NEW.city,NEW.category,NEW.version,NEW.updated_by,NEW.updated_at,to_jsonb(NEW));END IF;RETURN NEW;
END $$;
CREATE TRIGGER home_editor_activity AFTER INSERT OR UPDATE ON home_sections FOR EACH ROW EXECUTE FUNCTION home_editor_history_record();
CREATE TRIGGER home_taxonomy_activity AFTER INSERT OR UPDATE ON home_taxonomy FOR EACH ROW EXECUTE FUNCTION home_editor_history_record();
