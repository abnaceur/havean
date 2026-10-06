-- Reading the property zone must not grant agents geography UPDATE authority.
CREATE FUNCTION lock_viewing_property(target uuid) RETURNS TABLE(id uuid,version int,organization_id uuid,agent_id uuid,time_zone text) LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT l.id,l.version,l.organization_id,l.agent_id,ci.timezone FROM listings l JOIN units u ON u.id=l.unit_id JOIN communities co ON co.id=u.community_id JOIN districts d ON d.id=co.district_id JOIN cities ci ON ci.id=d.city_id WHERE l.id=target AND viewing_schedule_scope(l.id,l.agent_id) FOR SHARE OF l,ci
$$;
REVOKE ALL ON FUNCTION lock_viewing_property(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lock_viewing_property(uuid) TO haven_app;
