ALTER TABLE market_config ADD COLUMN updated_by uuid REFERENCES profiles,ADD COLUMN updated_at timestamptz;
CREATE TABLE market_configuration_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),city text NOT NULL REFERENCES cities(slug),version int NOT NULL CHECK(version>0),actor_id uuid REFERENCES profiles,at timestamptz,data jsonb NOT NULL,historical boolean NOT NULL DEFAULT false,UNIQUE(city,version));
INSERT INTO market_configuration_history(city,version,data,historical) SELECT id,version,data,true FROM market_config;
ALTER TABLE market_configuration_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY market_history_read ON market_configuration_history FOR SELECT USING(support_admin_actor(actor_id()));
CREATE TRIGGER market_history_immutable BEFORE UPDATE OR DELETE ON market_configuration_history FOR EACH ROW EXECUTE FUNCTION lease_history_guard();
CREATE FUNCTION market_configuration_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$ BEGIN
 IF current_user<>'haven_app' THEN IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;END IF;
 IF TG_OP='DELETE' OR NOT platform_admin_lock() THEN RAISE EXCEPTION 'Actual administrator and retained market history required' USING ERRCODE='23514';END IF;
 IF NEW.updated_by IS DISTINCT FROM actor_id() OR NEW.updated_at IS DISTINCT FROM statement_timestamp() OR jsonb_typeof(NEW.data)<>'object' THEN RAISE EXCEPTION 'Recorded market actor/time and object required' USING ERRCODE='23514';END IF;
 IF TG_OP='INSERT' AND NEW.version<>1 OR TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.version<>OLD.version+1) THEN RAISE EXCEPTION 'Current original market version required' USING ERRCODE='23514';END IF;
 IF NOT EXISTS(SELECT 1 FROM cities c WHERE c.slug=NEW.id AND c.status='active' AND NEW.data->>'currency'=c.currency AND NEW.data->>'timezone'=c.timezone AND NEW.data->>'name'=c.name) THEN RAISE EXCEPTION 'Exact active geography configuration required' USING ERRCODE='23514';END IF;RETURN NEW;
END $$;
CREATE TRIGGER market_configuration_admission BEFORE INSERT OR UPDATE OR DELETE ON market_config FOR EACH ROW EXECUTE FUNCTION market_configuration_guard();
CREATE FUNCTION market_configuration_record() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF actor_id() IS NOT NULL THEN INSERT INTO market_configuration_history(city,version,actor_id,at,data) VALUES(NEW.id,NEW.version,actor_id(),NEW.updated_at,NEW.data);END IF;RETURN NEW;
END $$;
CREATE TRIGGER market_configuration_activity AFTER INSERT OR UPDATE ON market_config FOR EACH ROW EXECUTE FUNCTION market_configuration_record();
ALTER TABLE agent_credentials ADD COLUMN market_version int;
