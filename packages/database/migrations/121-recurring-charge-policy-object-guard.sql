CREATE OR REPLACE FUNCTION recurring_charge_policy_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF jsonb_typeof(NEW.data) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Market configuration must be an object' USING ERRCODE='23514';END IF;
 NEW.data:=jsonb_build_object('chargeProration','calendar_days','legacyChargeDueDay',1)||NEW.data;
 IF NEW.data->>'chargeProration' NOT IN ('calendar_days','full_month') OR jsonb_typeof(NEW.data->'chargeProration')<>'string' OR jsonb_typeof(NEW.data->'legacyChargeDueDay')<>'number' OR (NEW.data->>'legacyChargeDueDay')!~'^(?:[1-9]|1[0-9]|2[0-8])$' THEN RAISE EXCEPTION 'Valid recurring charge policy and due day required' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
