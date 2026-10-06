DROP POLICY revision_scope ON listing_revisions;
CREATE POLICY revision_scope ON listing_revisions USING(actor_id=public.actor_id() OR staff_scope() OR review_scope() OR listing_id IN(SELECT id FROM listings WHERE organization_id=org_id() AND (NOT agent_only() OR agent_id IN(SELECT id FROM agents WHERE user_id=public.actor_id())))) WITH CHECK(staff_scope() OR review_scope() OR (actor_id=public.actor_id() AND listing_id IN(SELECT l.id FROM listings l WHERE (l.organization_id=org_id() AND (NOT agent_only() OR l.agent_id IN(SELECT id FROM agents WHERE user_id=public.actor_id()))) OR (l.owner_id=public.actor_id() AND EXISTS(SELECT 1 FROM owner_unit_grants g WHERE g.unit_id=l.unit_id AND g.owner_id=public.actor_id() AND g.status='active' AND (g.expires_at IS NULL OR g.expires_at>now()))))));
CREATE FUNCTION owner_price_revision_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE source listings%ROWTYPE;
BEGIN
 SELECT * INTO source FROM listings WHERE id=NEW.listing_id;
 IF NOT staff_scope() AND NOT review_scope() AND source.owner_id=actor_id() THEN
  IF TG_OP='UPDATE' OR NEW.actor_id<>actor_id() OR source.status<>'published' OR NEW.status<>'pending' OR NEW.base_version<>source.version OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.review_reason IS NOT NULL OR NEW.changes->>'title' IS DISTINCT FROM source.title OR (NEW.changes-'title'-'price'-'version'-'reason')<>'{}'::jsonb OR coalesce(NEW.changes->>'price','')!~'^[0-9]+(\.[0-9]{1,2})?$' OR length(NEW.changes->>'price')>16 THEN RAISE EXCEPTION 'Owner price changes require current published facts and independent review' USING ERRCODE='42501'; END IF;
  IF (NEW.changes->>'price')::numeric<=0 OR length(coalesce(NEW.changes->>'reason',''))<5 OR NOT EXISTS(SELECT 1 FROM current_owner_unit_grant(source.unit_id)) THEN RAISE EXCEPTION 'Owner price change requires current authority and a positive amount/reason' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER owner_price_revision_guard BEFORE INSERT OR UPDATE ON listing_revisions FOR EACH ROW EXECUTE FUNCTION owner_price_revision_guard();
