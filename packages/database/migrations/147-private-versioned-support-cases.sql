ALTER TABLE support_cases ADD COLUMN created_by uuid REFERENCES profiles,ADD COLUMN updated_by uuid REFERENCES profiles,ADD COLUMN updated_at timestamptz,ADD COLUMN listing_id uuid REFERENCES listings,ADD COLUMN listing_version int,ADD COLUMN listing_snapshot jsonb,ADD COLUMN assignee_id uuid REFERENCES profiles;
CREATE FUNCTION support_staff_actor(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM profiles p JOIN memberships m ON m.user_id=p.id WHERE p.id=target AND p.state='active' AND m.status='active' AND m.organization_id IS NULL AND m.role IN('support','admin')) $$;
CREATE FUNCTION support_case_access(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM support_cases s JOIN profiles p ON p.id=actor_id() AND p.state='active' WHERE s.id=target AND (s.user_id=p.id OR support_staff_actor(p.id))) $$;
CREATE POLICY support_case_current_actor ON support_cases AS RESTRICTIVE USING(EXISTS(SELECT 1 FROM profiles p WHERE p.id=actor_id() AND p.state='active') AND (user_id=actor_id() OR support_staff_actor(actor_id()))) WITH CHECK(EXISTS(SELECT 1 FROM profiles p WHERE p.id=actor_id() AND p.state='active') AND (user_id=actor_id() OR support_staff_actor(actor_id())));
CREATE TABLE support_case_history(case_id uuid NOT NULL REFERENCES support_cases,version int NOT NULL CHECK(version>0),status text NOT NULL,public_message text,assignee_id uuid REFERENCES profiles,actor_id uuid NOT NULL REFERENCES profiles,at timestamptz NOT NULL DEFAULT statement_timestamp(),PRIMARY KEY(case_id,version));
CREATE TABLE support_case_attachments(case_id uuid NOT NULL REFERENCES support_cases,asset_id uuid NOT NULL REFERENCES media_assets,asset_version int NOT NULL CHECK(asset_version>0),label text NOT NULL CHECK(length(btrim(label)) BETWEEN 2 AND 120),mime text NOT NULL CHECK(mime IN('image/jpeg','image/png','application/pdf')),actor_id uuid NOT NULL REFERENCES profiles,PRIMARY KEY(case_id,asset_id));
ALTER TABLE support_case_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_case_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY support_history_read ON support_case_history FOR SELECT USING(support_case_access(case_id));
CREATE POLICY support_history_append ON support_case_history FOR INSERT WITH CHECK(actor_id=actor_id() AND support_case_access(case_id));
CREATE POLICY support_attachment_read ON support_case_attachments FOR SELECT USING(support_case_access(case_id));
CREATE POLICY support_attachment_append ON support_case_attachments FOR INSERT WITH CHECK(actor_id=actor_id() AND support_case_access(case_id));
CREATE TRIGGER support_history_immutable BEFORE UPDATE OR DELETE ON support_case_history FOR EACH ROW EXECUTE FUNCTION lease_history_guard();
CREATE TRIGGER support_attachments_immutable BEFORE UPDATE OR DELETE ON support_case_attachments FOR EACH ROW EXECUTE FUNCTION lease_history_guard();
CREATE FUNCTION support_listing_admitted(target uuid,expected int,snapshot jsonb) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM listings l JOIN units u ON u.id=l.unit_id JOIN communities co ON co.id=u.community_id JOIN districts d ON d.id=co.district_id JOIN cities ci ON ci.id=d.city_id WHERE l.id=target AND l.version=expected AND l.status='published' AND ci.status='active' AND d.status='active' AND co.status='active' AND snapshot->>'title'=l.title AND snapshot->>'url'='/'||ci.slug||'/'||CASE WHEN l.segment='commercial' THEN 'commercial' WHEN l.transaction='rent' THEN 'rent' ELSE 'buy' END||'/'||l.slug) $$;
CREATE FUNCTION support_assignee_directory() RETURNS TABLE(id uuid,name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT DISTINCT p.id,p.display_name FROM profiles p JOIN memberships m ON m.user_id=p.id WHERE support_staff_actor(actor_id()) AND p.state='active' AND m.status='active' AND m.organization_id IS NULL AND m.role IN('support','admin') ORDER BY p.display_name,p.id LIMIT 100 $$;
CREATE FUNCTION support_case_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF current_user<>'haven_app' THEN RETURN NEW;END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Support case history must be retained' USING ERRCODE='23514';END IF;
 IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=actor_id() AND state='active') OR NEW.updated_by IS DISTINCT FROM actor_id() OR NEW.updated_at IS DISTINCT FROM statement_timestamp() THEN RAISE EXCEPTION 'Current support actor required' USING ERRCODE='23514';END IF;
 IF length(btrim(NEW.subject)) NOT BETWEEN 5 AND 120 OR length(btrim(NEW.description)) NOT BETWEEN 10 AND 3000 OR NEW.category NOT IN('General','Listing complaint','Account','Viewing','Other') OR (NEW.category='Listing complaint' AND NEW.listing_id IS NULL) OR ((NEW.listing_id IS NULL)<>(NEW.listing_snapshot IS NULL)) OR (NEW.listing_id IS NOT NULL AND (NEW.listing_version IS NULL OR NEW.listing_version<1 OR NEW.listing_snapshot->>'id' IS DISTINCT FROM NEW.listing_id::text OR (NEW.listing_snapshot->>'version')::int IS DISTINCT FROM NEW.listing_version)) THEN RAISE EXCEPTION 'Validated support case context required' USING ERRCODE='23514';END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.listing_id IS NOT NULL AND NOT support_listing_admitted(NEW.listing_id,NEW.listing_version,NEW.listing_snapshot) THEN RAISE EXCEPTION 'Current public listing snapshot required' USING ERRCODE='23514';END IF;
  IF NEW.user_id IS DISTINCT FROM actor_id() OR NEW.created_by IS DISTINCT FROM actor_id() OR NEW.version<>1 OR NEW.status<>'open' OR NEW.public_reply IS NOT NULL OR NEW.internal_note IS NOT NULL OR NEW.assignee_id IS NOT NULL OR NEW.created_at IS DISTINCT FROM statement_timestamp() THEN RAISE EXCEPTION 'New own open support case required' USING ERRCODE='23514';END IF;
 ELSE
  IF NOT support_staff_actor(actor_id()) OR NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['version','status','public_reply','assignee_id','updated_by','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['version','status','public_reply','assignee_id','updated_by','updated_at']) OR OLD.status<>'open' OR NEW.status<>'triaged' OR NEW.assignee_id IS NULL OR NOT support_staff_actor(NEW.assignee_id) OR length(btrim(NEW.public_reply)) NOT BETWEEN 5 AND 2000 THEN RAISE EXCEPTION 'Current versioned support triage required' USING ERRCODE='23514';END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER support_case_guard BEFORE INSERT OR UPDATE OR DELETE ON support_cases FOR EACH ROW EXECUTE FUNCTION support_case_guard();
CREATE FUNCTION support_history_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE s support_cases%ROWTYPE;
BEGIN
 SELECT * INTO s FROM support_cases WHERE id=NEW.case_id FOR SHARE;
 IF s.id IS NULL OR NEW.version<>s.version OR NEW.actor_id IS DISTINCT FROM actor_id() OR NEW.actor_id IS DISTINCT FROM s.updated_by OR NEW.status IS DISTINCT FROM s.status OR NEW.public_message IS DISTINCT FROM s.public_reply OR NEW.assignee_id IS DISTINCT FROM s.assignee_id OR NEW.at IS DISTINCT FROM s.updated_at THEN RAISE EXCEPTION 'Exact support history required' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER support_history_guard BEFORE INSERT ON support_case_history FOR EACH ROW EXECUTE FUNCTION support_history_guard();
CREATE FUNCTION support_history_required() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$ BEGIN IF current_user='haven_app' AND NOT EXISTS(SELECT 1 FROM support_case_history h WHERE h.case_id=NEW.id AND h.version=NEW.version) THEN RAISE EXCEPTION 'Support history must commit atomically' USING ERRCODE='23514';END IF;RETURN NULL;END $$;
CREATE CONSTRAINT TRIGGER support_history_required AFTER INSERT OR UPDATE ON support_cases DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION support_history_required();
-- Inventory-owned narrow admission/read ports for scanned private uploads.
CREATE FUNCTION support_owned_attachment(asset uuid,expected_version int) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a media_assets%ROWTYPE;
BEGIN
 SELECT * INTO a FROM media_assets WHERE id=asset AND owner_id=actor_id() AND version=expected_version AND visibility='private' AND status='approved' AND scan_at IS NOT NULL AND ((purpose='photo' AND mime IN('image/jpeg','image/png') AND variants->>'display' IS NOT NULL) OR (purpose='document' AND mime='application/pdf')) FOR SHARE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('mime',a.mime,'version',a.version);
END $$;
CREATE FUNCTION support_attachment_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE s support_cases%ROWTYPE;source jsonb;
BEGIN
 SELECT * INTO s FROM support_cases WHERE id=NEW.case_id FOR SHARE;source:=support_owned_attachment(NEW.asset_id,NEW.asset_version);
 IF s.id IS NULL OR s.version<>1 OR s.created_by IS DISTINCT FROM actor_id() OR NEW.actor_id IS DISTINCT FROM actor_id() OR EXISTS(SELECT 1 FROM support_case_history WHERE case_id=s.id) OR source IS NULL OR source->>'mime' IS DISTINCT FROM NEW.mime OR (SELECT count(*) FROM support_case_attachments WHERE case_id=s.id)>=6 THEN RAISE EXCEPTION 'Own approved private attachment at case creation required' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER support_attachment_guard BEFORE INSERT ON support_case_attachments FOR EACH ROW EXECUTE FUNCTION support_attachment_guard();
CREATE FUNCTION support_attachment_file(target uuid,asset uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT jsonb_build_object('key',CASE WHEN a.purpose='photo' THEN a.variants->>'display' ELSE a.object_key END,'mime',CASE WHEN a.purpose='photo' THEN 'image/webp' ELSE a.mime END) FROM support_case_attachments s JOIN media_assets a ON a.id=s.asset_id AND a.version=s.asset_version WHERE s.case_id=target AND a.id=asset AND support_case_access(target) AND a.visibility='private' AND a.status='approved' AND a.scan_at IS NOT NULL $$;
REVOKE ALL ON FUNCTION support_staff_actor(uuid),support_case_access(uuid),support_listing_admitted(uuid,int,jsonb),support_assignee_directory(),support_owned_attachment(uuid,int),support_attachment_file(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION support_staff_actor(uuid),support_case_access(uuid),support_listing_admitted(uuid,int,jsonb),support_assignee_directory(),support_owned_attachment(uuid,int),support_attachment_file(uuid,uuid) TO haven_app;
CREATE INDEX support_cases_reporter_date ON support_cases(user_id,created_at DESC,id);
CREATE INDEX support_cases_status_date ON support_cases(status,created_at DESC,id);
