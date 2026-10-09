ALTER TABLE outbox_effects ADD COLUMN receipt jsonb CHECK(receipt IS NULL OR jsonb_typeof(receipt)='object');
CREATE FUNCTION digitization_outbox_context(event_ref uuid) RETURNS TABLE(engine_id uuid,actor_id uuid,organization_id uuid,run_id uuid,kind text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT p.id,coalesce(r.created_by,p.created_by),p.organization_id,r.id,o.kind
 FROM outbox o JOIN property_digitizations p ON p.id=o.aggregate_id
 LEFT JOIN processing_runs r ON r.digitization_id=p.id AND r.id::text=o.payload->>'runId'
 WHERE o.id=event_ref AND o.kind LIKE 'digitization.%' AND p.organization_id IS NOT NULL
$$;
CREATE POLICY digitization_effect_read ON outbox_effects FOR SELECT USING(consumer='digitization' AND EXISTS(
 SELECT 1 FROM outbox o WHERE o.id=event_id AND o.kind LIKE 'digitization.%' AND digitization_target_access(o.aggregate_id)));
CREATE POLICY digitization_effect_create ON outbox_effects FOR INSERT WITH CHECK(consumer='digitization' AND receipt IS NOT NULL AND EXISTS(
 SELECT 1 FROM outbox o WHERE o.id=event_id AND o.kind LIKE 'digitization.%' AND digitization_target_access(o.aggregate_id)));
