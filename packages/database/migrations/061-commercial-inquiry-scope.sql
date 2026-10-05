CREATE OR REPLACE FUNCTION commercial_inquiry_context_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE offer public_listings%ROWTYPE; destination listings%ROWTYPE;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.commercial_context IS DISTINCT FROM OLD.commercial_context OR (OLD.commercial_context IS NOT NULL AND (NEW.resource_id IS DISTINCT FROM OLD.resource_id OR NEW.resource_type IS DISTINCT FROM OLD.resource_type OR NEW.resource_version IS DISTINCT FROM OLD.resource_version)) THEN RAISE EXCEPTION 'Submitted commercial context is immutable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.resource_type<>'listing' THEN
  IF NEW.commercial_context IS NOT NULL THEN RAISE EXCEPTION 'Commercial context requires a commercial listing' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 PERFORM published_listing_destination(NEW.resource_id);
 SELECT * INTO offer FROM public_listings WHERE id=NEW.resource_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Offer is no longer available' USING ERRCODE='23514'; END IF;
 IF offer.segment='commercial' THEN
  SELECT * INTO destination FROM listings WHERE id=offer.id;
  IF NEW.organization_id IS DISTINCT FROM destination.organization_id OR NEW.agent_id IS DISTINCT FROM destination.agent_id THEN RAISE EXCEPTION 'Commercial inquiry must target the responsible agency and agent' USING ERRCODE='42501'; END IF;
  IF NEW.resource_version IS DISTINCT FROM offer.version THEN RAISE EXCEPTION 'Commercial offer version changed' USING ERRCODE='23514'; END IF;
  NEW.commercial_context:=jsonb_build_object('segment','commercial','transaction',offer.transaction,'propertyType',offer."propertyType",'currency',offer.currency,'price',offer.price,'priceBasis',offer."priceBasis",'rentPeriod',offer."rentPeriod",'areaBasis',offer."areaBasis",'grossArea',offer."grossArea",'usableArea',offer."usableArea",'fitOut',offer."fitOut",'permittedUses',offer."permittedUses",'floor',offer."commercialFloor",'parkingSpaces',offer."parkingSpaces",'version',offer.version);
 ELSIF NEW.commercial_context IS NOT NULL THEN RAISE EXCEPTION 'Commercial context requires a commercial listing' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
