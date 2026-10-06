CREATE OR REPLACE FUNCTION financial_linked_reversal_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE evidence financial_reversal_evidence%ROWTYPE;root jsonb;
BEGIN
 IF NEW.reverses_id IS NULL OR current_user<>'haven_app' OR management_admin() THEN RETURN NEW;END IF;
 SELECT * INTO evidence FROM financial_reversal_evidence WHERE record_type=CASE WHEN TG_TABLE_NAME='payments' THEN 'payment' ELSE 'charge' END AND original_id=NEW.reverses_id AND reversal_id=NEW.id AND actor_id=actor_id();
 IF TG_TABLE_NAME='payments' THEN SELECT to_jsonb(p) INTO root FROM payments p WHERE p.id=NEW.reverses_id;ELSE SELECT to_jsonb(ch) INTO root FROM charges ch WHERE ch.id=NEW.reverses_id;END IF;
 IF evidence.original_id IS NULL OR root IS NULL OR evidence.organization_id IS DISTINCT FROM NEW.organization_id OR evidence.lease_id IS DISTINCT FROM NEW.lease_id OR (root->>'amount')::numeric IS DISTINCT FROM NEW.amount OR root->>'currency' IS DISTINCT FROM NEW.currency OR NEW.status<>'posted' THEN RAISE EXCEPTION 'Attributed exact linked reversal evidence required' USING ERRCODE='23514';END IF;
 IF TG_TABLE_NAME='charges' AND ((root->>'period') IS DISTINCT FROM (to_jsonb(NEW)->>'period') OR (root->>'due_date') IS DISTINCT FROM (to_jsonb(NEW)->>'due_date') OR (to_jsonb(NEW)->>'kind') IS DISTINCT FROM 'reversal:'||NEW.reverses_id::text) THEN RAISE EXCEPTION 'Exact charge period and due date required' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
