ALTER TABLE commercial_details ADD COLUMN area_basis text CHECK(area_basis IN('gross','usable')),ADD COLUMN sale_basis text CHECK(sale_basis IN('total','per_area'));
-- Preserve the explicitly recorded legacy basis under its correct transaction
-- field. No price or missing area definition is inferred.
UPDATE commercial_details c SET sale_basis=c.rent_basis,rent_basis=NULL FROM listings l WHERE l.id=c.listing_id AND l.transaction='sale';
CREATE FUNCTION commercial_price_transaction_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE parent listings%ROWTYPE;
BEGIN
 SELECT * INTO parent FROM listings WHERE id=NEW.listing_id;
 IF parent.segment IS DISTINCT FROM 'commercial' OR (parent.transaction='sale' AND NEW.rent_basis IS NOT NULL) OR (parent.transaction='rent' AND NEW.sale_basis IS NOT NULL) THEN RAISE EXCEPTION 'Commercial price basis must match its transaction' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER commercial_price_transaction_guard BEFORE INSERT OR UPDATE ON commercial_details FOR EACH ROW EXECUTE FUNCTION commercial_price_transaction_guard();
