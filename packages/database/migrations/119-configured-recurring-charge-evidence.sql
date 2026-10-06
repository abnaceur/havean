UPDATE market_config SET data=jsonb_build_object('chargeProration','calendar_days','legacyChargeDueDay',1)||data,version=version+1 WHERE NOT(data ? 'chargeProration') OR NOT(data ? 'legacyChargeDueDay');
ALTER TABLE charges ADD COLUMN version int NOT NULL DEFAULT 1 CHECK(version>0),ADD COLUMN generated_by uuid REFERENCES profiles,ADD COLUMN generation_snapshot jsonb;
CREATE FUNCTION management_finance_lock(target uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM 1 FROM profiles p JOIN memberships m ON m.user_id=p.id JOIN organizations o ON o.id=m.organization_id WHERE p.id=actor_id() AND p.state='active' AND m.status='active' AND m.role='finance' AND m.organization_id=target AND target=org_id() AND o.type='manager' ORDER BY m.id LIMIT 1 FOR SHARE OF p,m;
 RETURN FOUND;
END $$;
CREATE FUNCTION management_charge_config(target uuid,target_org uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE snapshot jsonb;
BEGIN
 IF NOT management_unit_granted(target,target_org) THEN RETURN NULL;END IF;
 SELECT jsonb_build_object('city',ci.slug,'version',m.version,'proration',coalesce(m.data->>'chargeProration','calendar_days'),'legacyDueDay',coalesce((m.data->>'legacyChargeDueDay')::int,1)) INTO snapshot FROM units u JOIN communities co ON co.id=u.community_id JOIN districts d ON d.id=co.district_id JOIN cities ci ON ci.id=d.city_id JOIN market_config m ON m.id=ci.slug WHERE u.id=target FOR SHARE OF m;
 RETURN snapshot;
END $$;
CREATE FUNCTION native_recurring_charge_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE l leases%ROWTYPE;
BEGIN
 IF current_user<>'haven_app' OR management_admin() OR NEW.reverses_id IS NOT NULL THEN RETURN NEW;END IF;
 IF NEW.generated_by IS NOT NULL THEN
 SELECT * INTO l FROM leases WHERE id=NEW.lease_id FOR SHARE;
 IF NOT management_finance_lock(NEW.organization_id) OR NEW.generated_by IS DISTINCT FROM actor_id() OR l.id IS NULL OR l.organization_id<>NEW.organization_id OR l.status<>'active' OR l.currency<>NEW.currency OR l.start_date>(NEW.period+interval '1 month'-interval '1 day')::date OR l.end_date<NEW.period OR NEW.period<>date_trunc('month',NEW.period)::date OR NEW.kind<>'rent' OR NEW.status<>'posted' OR NEW.generation_snapshot IS NULL OR (NEW.generation_snapshot->>'leaseVersion')::int<>l.version OR NOT management_unit_granted(l.unit_id,l.organization_id) THEN RAISE EXCEPTION 'Current finance, active term and recurring charge evidence required' USING ERRCODE='23514';END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER native_recurring_charge_guard BEFORE INSERT ON charges FOR EACH ROW EXECUTE FUNCTION native_recurring_charge_guard();
REVOKE ALL ON FUNCTION management_finance_lock(uuid),management_charge_config(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION management_finance_lock(uuid),management_charge_config(uuid,uuid) TO haven_app;
