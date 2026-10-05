DROP POLICY revision_scope ON listing_revisions;
CREATE POLICY revision_scope ON listing_revisions USING(
 actor_id=public.actor_id() OR staff_scope() OR review_scope() OR listing_id IN(
  SELECT id FROM listings WHERE organization_id=org_id() AND (NOT agent_only() OR agent_id IN(SELECT id FROM agents WHERE user_id=public.actor_id()))
 )
) WITH CHECK(staff_scope() OR review_scope() OR (actor_id=public.actor_id() AND listing_id IN(
 SELECT id FROM listings WHERE organization_id=org_id() AND (NOT agent_only() OR agent_id IN(SELECT id FROM agents WHERE user_id=public.actor_id()))
)));
