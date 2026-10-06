ALTER TABLE owner_submissions ADD COLUMN asking_price numeric(18,2) CHECK(asking_price>0),ADD COLUMN currency char(3),ADD COLUMN rent_period text CHECK(rent_period IN('day','month','year'));
-- Preserve valid historical declared amounts. Unknown/incomplete legacy drafts
-- retain null canonical terms and must pass the current submission validation.
UPDATE owner_submissions s SET asking_price=(s.data->>'price')::numeric,currency=ci.currency,rent_period=CASE WHEN s.data->>'transaction'='rent' THEN COALESCE(s.data->>'rentPeriod','month') ELSE NULL END
FROM communities co JOIN districts d ON d.id=co.district_id JOIN cities ci ON ci.id=d.city_id
WHERE s.status IN('submitted','approved','rejected') AND co.id=CASE WHEN s.data->>'communityId'~'^[0-9a-fA-F-]{36}$' THEN (s.data->>'communityId')::uuid ELSE NULL END
AND s.data->>'price'~'^\d{1,13}(\.\d{1,2})?$' AND (s.data->>'price')::numeric>0 AND s.data->>'transaction' IN('sale','rent');
CREATE FUNCTION owner_submission_terms_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.asking_price IS NOT NULL THEN
  IF NEW.currency IS NULL OR NEW.data->>'price' IS NULL OR NEW.asking_price<>(NEW.data->>'price')::numeric OR (NEW.data->>'currency' IS NOT NULL AND NEW.currency::text<>NEW.data->>'currency') OR NEW.data->>'transaction' NOT IN('sale','rent') OR (NEW.data->>'transaction'='sale' AND NEW.rent_period IS NOT NULL) OR (NEW.data->>'transaction'='rent' AND (NEW.rent_period IS NULL OR (NEW.data->>'rentPeriod' IS NOT NULL AND NEW.rent_period<>NEW.data->>'rentPeriod'))) THEN RAISE EXCEPTION 'Submitted owner terms must retain exact canonical amount/currency/period' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER owner_submission_terms_guard BEFORE INSERT OR UPDATE ON owner_submissions FOR EACH ROW EXECUTE FUNCTION owner_submission_terms_guard();
