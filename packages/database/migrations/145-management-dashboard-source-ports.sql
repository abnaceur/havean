-- Inventory-owned occupancy projection respects parent/room exclusivity without
-- exposing contracts or identities outside the currently admitted managed unit.
CREATE FUNCTION management_unit_occupation_on(target uuid,day date) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN NOT management_unit_granted(target,org_id()) THEN NULL
 WHEN EXISTS(SELECT 1 FROM units subject JOIN units other ON other.id=subject.id OR other.id=subject.parent_unit_id OR other.parent_unit_id=subject.id JOIN leases l ON l.unit_id=other.id WHERE subject.id=target AND l.status IN('active','ended') AND day BETWEEN l.start_date AND l.end_date AND (l.drafted_by IS NULL OR EXISTS(SELECT 1 FROM lease_draft_history h WHERE h.lease_id=l.id AND h.action='activated' AND h.at<(day+1)::timestamp AT TIME ZONE 'UTC')) AND (l.status='active' OR EXISTS(SELECT 1 FROM lease_endings e WHERE e.lease_id=l.id AND e.at>=(day+1)::timestamp AT TIME ZONE 'UTC'))) THEN 'occupied'
 WHEN EXISTS(SELECT 1 FROM units subject JOIN units other ON other.id=subject.id OR other.id=subject.parent_unit_id OR other.parent_unit_id=subject.id JOIN leases l ON l.unit_id=other.id WHERE subject.id=target AND l.status='ended' AND day BETWEEN l.start_date AND l.end_date AND NOT EXISTS(SELECT 1 FROM lease_endings e WHERE e.lease_id=l.id)) THEN 'unknown'
 ELSE 'vacant' END
$$;
-- Finance may read declared maintenance aggregates; this port returns no private
-- text, staff identity or foreign resource identifiers.
CREATE FUNCTION management_maintenance_counts_on(day date) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH records AS(SELECT r.id,h.status FROM maintenance r JOIN leases l ON l.id=r.lease_id LEFT JOIN LATERAL(SELECT mh.status FROM maintenance_history mh WHERE mh.request_id=r.id AND mh.at<(day+1)::timestamp AT TIME ZONE 'UTC' ORDER BY mh.version DESC LIMIT 1) h ON true WHERE management_team(org_id()) AND r.organization_id=org_id() AND l.organization_id=org_id() AND management_unit_granted(l.unit_id,org_id()) AND r.created_at<(day+1)::timestamp AT TIME ZONE 'UTC'), counts AS(SELECT status,count(*)::int AS count FROM records WHERE status IS NOT NULL GROUP BY status)
 SELECT jsonb_build_object('counts',coalesce((SELECT jsonb_agg(jsonb_build_object('status',status,'count',count) ORDER BY status) FROM counts),'[]'::jsonb),'unknownHistory',(SELECT count(*)::int FROM records WHERE status IS NULL))
$$;
REVOKE ALL ON FUNCTION management_unit_occupation_on(uuid,date),management_maintenance_counts_on(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION management_unit_occupation_on(uuid,date),management_maintenance_counts_on(date) TO haven_app;
