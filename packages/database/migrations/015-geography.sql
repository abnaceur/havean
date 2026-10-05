-- Geography identifiers and slugs remain stable throughout edits.
ALTER TABLE cities ADD COLUMN aliases text[] NOT NULL DEFAULT '{}', ADD COLUMN version integer NOT NULL DEFAULT 1, ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived'));
ALTER TABLE districts ADD COLUMN slug text, ADD COLUMN aliases text[] NOT NULL DEFAULT '{}', ADD COLUMN version integer NOT NULL DEFAULT 1, ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived'));
UPDATE districts SET slug=trim(both '-' FROM regexp_replace(lower(name),'[^a-z0-9]+','-','g'));
ALTER TABLE districts ALTER COLUMN slug SET NOT NULL, ADD UNIQUE(city_id,slug), ADD UNIQUE(id,city_id);
CREATE TABLE neighborhoods(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),district_id uuid NOT NULL REFERENCES districts,slug text NOT NULL,name text NOT NULL,aliases text[] NOT NULL DEFAULT '{}',version int NOT NULL DEFAULT 1,status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),UNIQUE(district_id,slug));
CREATE TABLE transit_lines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),city_id uuid NOT NULL REFERENCES cities,slug text NOT NULL,name text NOT NULL,aliases text[] NOT NULL DEFAULT '{}',version int NOT NULL DEFAULT 1,status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),UNIQUE(city_id,slug),UNIQUE(id,city_id));
CREATE TABLE transit_stations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),city_id uuid NOT NULL REFERENCES cities,line_id uuid NOT NULL,district_id uuid NOT NULL,slug text NOT NULL,name text NOT NULL,aliases text[] NOT NULL DEFAULT '{}',latitude numeric(9,6) NOT NULL CHECK(latitude BETWEEN -90 AND 90),longitude numeric(9,6) NOT NULL CHECK(longitude BETWEEN -180 AND 180),version int NOT NULL DEFAULT 1,status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),FOREIGN KEY(line_id,city_id) REFERENCES transit_lines(id,city_id),FOREIGN KEY(district_id,city_id) REFERENCES districts(id,city_id),UNIQUE(line_id,slug));
ALTER TABLE communities ADD COLUMN aliases text[] NOT NULL DEFAULT '{}', ADD COLUMN neighborhood_id uuid REFERENCES neighborhoods, ADD COLUMN version int NOT NULL DEFAULT 1, ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived'));
CREATE TABLE buildings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),aliases text[] NOT NULL DEFAULT '{}',community_id uuid NOT NULL REFERENCES communities,slug text NOT NULL,name text NOT NULL,floors int CHECK(floors BETWEEN 1 AND 200),completed_year int CHECK(completed_year BETWEEN 1800 AND 2200),version int NOT NULL DEFAULT 1,status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),UNIQUE(community_id,slug));
CREATE FUNCTION check_community_neighborhood() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.neighborhood_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM neighborhoods WHERE id=NEW.neighborhood_id AND district_id=NEW.district_id) THEN RAISE EXCEPTION 'Community neighborhood belongs to another district' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;
CREATE TRIGGER community_neighborhood BEFORE INSERT OR UPDATE ON communities FOR EACH ROW EXECUTE FUNCTION check_community_neighborhood();
ALTER TABLE cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE districts ENABLE ROW LEVEL SECURITY;
ALTER TABLE communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE neighborhoods ENABLE ROW LEVEL SECURITY;
ALTER TABLE transit_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE transit_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
CREATE POLICY city_read ON cities FOR SELECT USING(status='active' OR current_setting('app.admin',true)='true');
CREATE POLICY district_read ON districts FOR SELECT USING((status='active' AND EXISTS(SELECT 1 FROM cities WHERE id=city_id)) OR current_setting('app.admin',true)='true');
CREATE POLICY neighborhood_read ON neighborhoods FOR SELECT USING((status='active' AND EXISTS(SELECT 1 FROM districts WHERE id=district_id)) OR current_setting('app.admin',true)='true');
CREATE POLICY community_read ON communities FOR SELECT USING((status='active' AND EXISTS(SELECT 1 FROM districts WHERE id=district_id)) OR current_setting('app.admin',true)='true');
CREATE POLICY line_read ON transit_lines FOR SELECT USING((status='active' AND EXISTS(SELECT 1 FROM cities WHERE id=city_id)) OR current_setting('app.admin',true)='true');
CREATE POLICY station_read ON transit_stations FOR SELECT USING((status='active' AND EXISTS(SELECT 1 FROM transit_lines WHERE id=line_id) AND EXISTS(SELECT 1 FROM districts WHERE id=district_id)) OR current_setting('app.admin',true)='true');
CREATE POLICY building_read ON buildings FOR SELECT USING((status='active' AND EXISTS(SELECT 1 FROM communities WHERE id=community_id)) OR current_setting('app.admin',true)='true');
DO $$ DECLARE target text; BEGIN FOREACH target IN ARRAY ARRAY['cities','districts','neighborhoods','communities','transit_lines','transit_stations','buildings'] LOOP EXECUTE format('CREATE POLICY geography_admin ON %I FOR ALL USING(current_setting(''app.admin'',true)=''true'') WITH CHECK(current_setting(''app.admin'',true)=''true'')',target); END LOOP; END $$;

CREATE FUNCTION stable_geography_slug() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.slug IS DISTINCT FROM OLD.slug THEN RAISE EXCEPTION 'Geography slugs are immutable' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;
DO $$ DECLARE target text; BEGIN FOREACH target IN ARRAY ARRAY['cities','districts','neighborhoods','communities','transit_lines','transit_stations','buildings'] LOOP EXECUTE format('CREATE TRIGGER stable_slug BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION stable_geography_slug()',target); END LOOP; END $$;

ALTER TABLE units ADD COLUMN building_id uuid REFERENCES buildings;
CREATE FUNCTION unit_building_parent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.building_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM buildings WHERE id=NEW.building_id AND community_id=NEW.community_id) THEN RAISE EXCEPTION 'Unit building belongs to another community' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;
CREATE TRIGGER unit_building_parent BEFORE INSERT OR UPDATE ON units FOR EACH ROW EXECUTE FUNCTION unit_building_parent();
