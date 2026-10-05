ALTER TABLE profiles ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE profiles ADD COLUMN email_verified boolean;
ALTER TABLE profiles ADD COLUMN contact_synced_at timestamptz;
-- Identity-provider synchronization uses its trusted unscoped connection.
-- Authenticated application actors can change only their own local preferences.
CREATE FUNCTION protect_local_profile() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF actor_id() IS NOT NULL AND NOT staff_scope() THEN
  IF OLD.id<>actor_id() OR NEW.id<>actor_id() OR OLD.state<>'active' THEN
   RAISE EXCEPTION 'Profile update is not permitted' USING ERRCODE='42501';
  END IF;
  IF (to_jsonb(NEW)-ARRAY['display_name','locale','version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['display_name','locale','version']) THEN
   RAISE EXCEPTION 'Identity-managed fields cannot be changed here' USING ERRCODE='42501';
  END IF;
  IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Profile version changed' USING ERRCODE='40001'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER profiles_local_preferences BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION protect_local_profile();
