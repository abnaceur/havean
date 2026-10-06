ALTER TABLE providers ADD COLUMN version int NOT NULL DEFAULT 1 CHECK(version>0);
CREATE FUNCTION inquiry_guest_actor() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('app.inquiry_guest',true),'')::uuid$$;
CREATE TABLE inquiry_sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),version int NOT NULL DEFAULT 1 CHECK(version>0),status text NOT NULL DEFAULT 'active' CHECK(status IN('active','revoked')),created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '30 minutes',CHECK(expires_at>created_at AND expires_at<=created_at+interval '30 minutes'));
ALTER TABLE inquiry_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY inquiry_session_read ON inquiry_sessions FOR SELECT USING(id=inquiry_guest_actor() OR staff_scope());
CREATE POLICY inquiry_session_create ON inquiry_sessions FOR INSERT WITH CHECK(id=inquiry_guest_actor() AND version=1 AND status='active');
CREATE POLICY inquiry_session_cleanup ON inquiry_sessions FOR DELETE USING(staff_scope() OR expires_at<now()-interval '1 day');
CREATE TABLE inquiry_rate_windows(fingerprint text NOT NULL CHECK(fingerprint~'^[a-f0-9]{64}$'),window_start timestamptz NOT NULL,used int NOT NULL CHECK(used>0),PRIMARY KEY(fingerprint,window_start));
CREATE INDEX inquiry_rate_cleanup ON inquiry_rate_windows(window_start);
ALTER TABLE inquiry_rate_windows ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION consume_inquiry_rate(p_fingerprint text,p_maximum int,p_window timestamptz) RETURNS TABLE(used_count int,window_begin timestamptz,reset_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE current_used int;
BEGIN
 IF p_maximum NOT IN(5,30,60) OR p_window IS NULL OR p_window>statement_timestamp() OR p_window<statement_timestamp()-interval '10 minutes' OR mod(extract(epoch FROM p_window)::numeric,600)<>0 THEN RAISE EXCEPTION 'Invalid inquiry admission policy' USING ERRCODE='23514';END IF;
 INSERT INTO inquiry_rate_windows(fingerprint,window_start,used) VALUES(p_fingerprint,p_window,1) ON CONFLICT ON CONSTRAINT inquiry_rate_windows_pkey DO UPDATE SET used=inquiry_rate_windows.used+1 RETURNING inquiry_rate_windows.used INTO current_used;
 DELETE FROM inquiry_rate_windows w WHERE w.window_start<statement_timestamp()-interval '1 day';
 RETURN QUERY SELECT current_used,p_window,p_window+interval '10 minutes';
END $$;
REVOKE ALL ON FUNCTION consume_inquiry_rate(text,int,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION consume_inquiry_rate(text,int,timestamptz) TO haven_app;
ALTER TABLE leads ADD COLUMN guest_session_id uuid REFERENCES inquiry_sessions ON DELETE SET NULL;
ALTER TABLE leads ADD COLUMN consent_at timestamptz;
ALTER TABLE leads ADD COLUMN consent_policy_version int CHECK(consent_policy_version>0);
ALTER TABLE leads ADD COLUMN inquiry_city text REFERENCES cities(slug);
ALTER TABLE leads ADD CONSTRAINT recorded_inquiry_consent CHECK((consent_at IS NULL)=(consent_policy_version IS NULL));
CREATE TABLE guest_inquiry_requests(session_id uuid NOT NULL REFERENCES inquiry_sessions ON DELETE CASCADE,key text NOT NULL CHECK(length(key) BETWEEN 8 AND 100),request_hash text NOT NULL CHECK(request_hash~'^[a-f0-9]{64}$'),lead_id uuid NOT NULL REFERENCES leads ON DELETE CASCADE,response jsonb NOT NULL,PRIMARY KEY(session_id,key));
ALTER TABLE guest_inquiry_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY guest_request_read ON guest_inquiry_requests FOR SELECT USING(session_id=inquiry_guest_actor());
CREATE POLICY guest_request_create ON guest_inquiry_requests FOR INSERT WITH CHECK(session_id=inquiry_guest_actor() AND EXISTS(SELECT 1 FROM inquiry_sessions s WHERE s.id=session_id AND s.status='active' AND s.expires_at>now()));
-- A read-only eligibility port proves guest INSERT destinations, without granting private reads.
CREATE FUNCTION guest_inquiry_destination_valid(kind text,resource uuid,organization uuid,agent uuid,resource_version int,city_slug text,type_id uuid,type_version int,intent text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF kind='listing' THEN RETURN EXISTS(SELECT 1 FROM published_listing_destination(resource) destination JOIN public_listings p ON p.id=resource WHERE destination.organization_id=organization AND p.version=resource_version AND ((agent IS NULL AND NOT EXISTS(SELECT 1 FROM public_listing_agents(resource))) OR EXISTS(SELECT 1 FROM public_listing_agents(resource) eligible WHERE eligible.id=agent)));
 ELSIF kind='development' THEN RETURN agent IS NULL AND EXISTS(SELECT 1 FROM published_development_destination(resource,type_id) destination WHERE destination.organization_id=organization AND destination.version=resource_version AND destination.floor_plan_version IS NOT DISTINCT FROM type_version AND (intent<>'available_unit' OR destination.status='on_sale' AND destination.available>0));
 ELSIF kind='provider' THEN RETURN agent IS NULL AND EXISTS(SELECT 1 FROM providers p WHERE p.id=resource AND p.organization_id=organization AND p.status='approved' AND p.version=resource_version);
 ELSIF kind='agent' THEN RETURN agent=resource AND EXISTS(SELECT 1 FROM agents a JOIN profiles p ON p.id=a.user_id AND p.state='active' JOIN cities ci ON ci.slug=city_slug AND ci.status='active' WHERE a.id=resource AND a.organization_id=organization AND a.version=resource_version AND a.verified_until>=(now() AT TIME ZONE ci.timezone)::date AND (a.city IS NULL OR a.city=ci.slug) AND EXISTS(SELECT 1 FROM districts d WHERE d.city_id=ci.id AND d.status='active' AND d.name=ANY(a.districts)) AND EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=a.user_id AND m.organization_id=organization AND m.status='active' AND m.role IN('agent','agency_manager')));
 END IF;RETURN false;
END $$;
REVOKE ALL ON FUNCTION guest_inquiry_destination_valid(text,uuid,uuid,uuid,int,text,uuid,int,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION guest_inquiry_destination_valid(text,uuid,uuid,uuid,int,text,uuid,int,text) TO haven_app;
CREATE POLICY guest_inquiry_read ON leads FOR SELECT USING(guest_session_id=inquiry_guest_actor() AND EXISTS(SELECT 1 FROM inquiry_sessions s WHERE s.id=guest_session_id AND s.status='active' AND s.expires_at>now()));
CREATE POLICY guest_inquiry_insert ON leads FOR INSERT WITH CHECK(user_id IS NULL AND guest_session_id=inquiry_guest_actor() AND status='new' AND version=1 AND consent_at IS NOT NULL AND consent_policy_version=1 AND EXISTS(SELECT 1 FROM inquiry_sessions s WHERE s.id=guest_session_id AND s.status='active' AND s.expires_at>now()) AND guest_inquiry_destination_valid(resource_type,resource_id,organization_id,agent_id,resource_version,inquiry_city,floor_plan_id,floor_plan_version,inquiry_intent));
-- Historical rows retain unknown consent; no approval is backfilled.
CREATE FUNCTION notify_inquiry_destination(p_lead uuid,p_event uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE source leads%ROWTYPE;recipient uuid;
BEGIN
 SELECT * INTO source FROM leads l WHERE l.id=p_lead AND l.status='new' AND l.consent_at IS NOT NULL;
 IF NOT FOUND OR NOT coalesce((source.user_id=actor_id() OR (source.user_id IS NULL AND source.guest_session_id=inquiry_guest_actor() AND EXISTS(SELECT 1 FROM inquiry_sessions s WHERE s.id=source.guest_session_id AND s.status='active' AND s.expires_at>now()))),false) OR NOT EXISTS(SELECT 1 FROM outbox e WHERE e.id=p_event AND e.aggregate_id=p_lead AND e.kind='inquiry.routed') THEN RAISE EXCEPTION 'Current owned inquiry event required' USING ERRCODE='42501';END IF;
 IF source.agent_id IS NOT NULL THEN SELECT a.user_id INTO recipient FROM agents a JOIN profiles p ON p.id=a.user_id AND p.state='active' WHERE a.id=source.agent_id AND a.organization_id=source.organization_id AND EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=a.user_id AND m.organization_id=a.organization_id AND m.status='active' AND m.role IN('agent','agency_manager'));
 ELSE SELECT p.id INTO recipient FROM memberships m JOIN profiles p ON p.id=m.user_id AND p.state='active' JOIN organizations o ON o.id=m.organization_id WHERE m.organization_id=source.organization_id AND m.status='active' AND m.role=CASE o.type WHEN 'agency' THEN 'agency_manager' WHEN 'developer' THEN 'developer' WHEN 'vendor' THEN 'vendor' ELSE 'agency_manager' END ORDER BY p.id LIMIT 1;END IF;
 IF recipient IS NULL THEN RAISE EXCEPTION 'Current inquiry team required' USING ERRCODE='23514';END IF;
 INSERT INTO notifications(user_id,title,body,source_event_id,action_url) VALUES(recipient,CASE WHEN source.agent_id IS NULL THEN 'New team inquiry' ELSE 'New assigned inquiry' END,'A new contact request is saved in your professional inquiry queue.',p_event,'/ops/leads') ON CONFLICT(source_event_id) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION notify_inquiry_destination(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION notify_inquiry_destination(uuid,uuid) TO haven_app;
