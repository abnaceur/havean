-- Inventory changes while awaiting review invalidate the submitted snapshot
-- so the owner can resubmit; no stale pending review can become stuck.
CREATE OR REPLACE FUNCTION development_publication_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'draft' THEN RAISE EXCEPTION 'New projects require independent publication review' USING ERRCODE='23514'; END IF;
 ELSIF (NEW.name,NEW.description,NEW.community_id,NEW.price_min,NEW.price_max,NEW.price_basis,NEW.currency,NEW.completion_date,NEW.features) IS DISTINCT FROM (OLD.name,OLD.description,OLD.community_id,OLD.price_min,OLD.price_max,OLD.price_basis,OLD.currency,OLD.completion_date,OLD.features) THEN
  UPDATE development_publication SET state='draft',version=version+1,reason='',reviewed_by=NULL,reviewed_at=NULL WHERE development_id=NEW.id AND state<>'draft';
  NEW.status:='draft';
 END IF;
 IF TG_OP='UPDATE' AND NEW.version<>OLD.version THEN
  UPDATE development_publication SET state='draft',version=version+1,reason='',reviewed_by=NULL,reviewed_at=NULL WHERE development_id=NEW.id AND state='submitted';
  IF FOUND THEN NEW.status:='draft'; END IF;
 END IF;
 IF NEW.status IN('coming_soon','on_sale','sold_out') AND NOT EXISTS(SELECT 1 FROM development_publication WHERE development_id=NEW.id AND state IN('approved','legacy_published')) THEN RAISE EXCEPTION 'Development publication requires independent approval' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
