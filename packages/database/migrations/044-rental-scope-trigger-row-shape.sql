-- A shared trigger must read differing row fields without referencing an absent attribute.
CREATE OR REPLACE FUNCTION validate_rental_scope() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target uuid; row record;
BEGIN
 target:=coalesce((to_jsonb(NEW)->>'listing_id')::uuid,(to_jsonb(NEW)->>'id')::uuid);
 SELECT l.transaction,l.segment,l.currency,l.rent_period,u.unit_kind,t.rental_mode,t.billing_period,t.currency terms_currency INTO row FROM listings l JOIN units u ON u.id=l.unit_id LEFT JOIN rental_terms t ON t.listing_id=l.id WHERE l.id=target;
 IF row.unit_kind='room' AND (row.transaction<>'rent' OR row.segment<>'residential' OR row.rental_mode IS DISTINCT FROM 'shared') THEN RAISE EXCEPTION 'Room listings require shared residential rental terms' USING ERRCODE='23514'; END IF;
 IF row.rental_mode='shared' AND row.unit_kind<>'room' THEN RAISE EXCEPTION 'Shared rentals require an explicit child room' USING ERRCODE='23514'; END IF;
 IF row.billing_period IS NOT NULL AND row.billing_period IS DISTINCT FROM row.rent_period THEN RAISE EXCEPTION 'Billing period differs from listing rent period' USING ERRCODE='23514'; END IF;
 IF row.terms_currency IS NOT NULL AND row.terms_currency<>row.currency THEN RAISE EXCEPTION 'Deposit currency differs from listing currency' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
