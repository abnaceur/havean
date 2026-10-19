-- Competing current facts cannot be hidden by selecting only one decision.
ALTER FUNCTION digitization_inventory_application_current(uuid) RENAME TO digitization_inventory_application_current_base;
REVOKE ALL ON FUNCTION digitization_inventory_application_current_base(uuid) FROM PUBLIC,haven_app;
CREATE FUNCTION digitization_inventory_application_current(revision_ref uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT digitization_inventory_application_current_base(revision_ref) AND NOT EXISTS(
 WITH context AS (SELECT * FROM digitization_inventory_applications WHERE revision_id=revision_ref),
 effective AS (
 SELECT f.field,d.decision,CASE WHEN d.decision IS NULL OR d.decision='accepted' AND (d.value IS NULL OR d.value='null'::jsonb) THEN f.candidate->'normalizedValue' ELSE d.value END AS value
 FROM context app JOIN fact_candidates f ON f.digitization_id=app.digitization_id AND f.input_revision=app.input_revision
 LEFT JOIN LATERAL (SELECT decision,value FROM fact_decisions WHERE candidate_id=f.id AND digitization_id=f.digitization_id AND candidate_version=f.version ORDER BY created_at DESC,id DESC LIMIT 1) d ON true
 WHERE EXISTS(SELECT 1 FROM fact_candidates chosen JOIN fact_decisions decision ON decision.candidate_id=chosen.id WHERE decision.id=ANY(app.decision_ids) AND chosen.field=f.field)),
 comparable AS (SELECT field,decision,CASE WHEN jsonb_typeof(value)='object' AND value?'amount' THEN jsonb_set(value,'{amount}',to_jsonb((value->>'amount')::numeric)) ELSE value END value FROM effective WHERE decision IS NULL OR decision NOT IN('rejected','unknown'))
 SELECT field FROM comparable GROUP BY field HAVING bool_or(decision='conflict') OR count(DISTINCT value) FILTER(WHERE value IS NOT NULL AND value<>'null'::jsonb)>1);
$$;
REVOKE ALL ON FUNCTION digitization_inventory_application_current(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION digitization_inventory_application_current(uuid) TO haven_app;
