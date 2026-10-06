-- Preserve native authority; the guest addition still requires its own INSERT policy.
DROP POLICY lead_destination ON leads;
CREATE POLICY lead_destination ON leads AS RESTRICTIVE FOR INSERT WITH CHECK(
 organization_id=org_id() OR staff_scope() OR
 (user_id=actor_id() AND (
  (resource_type='listing' AND EXISTS(SELECT 1 FROM listings WHERE id=resource_id AND listings.organization_id=leads.organization_id AND status='published')) OR
  (resource_type='development' AND EXISTS(SELECT 1 FROM developments WHERE id=resource_id AND developments.organization_id=leads.organization_id AND status IN ('on_sale','coming_soon'))) OR
  (resource_type='agent' AND EXISTS(SELECT 1 FROM agents WHERE id=resource_id AND agents.organization_id=leads.organization_id)) OR
  (resource_type='provider' AND EXISTS(SELECT 1 FROM providers WHERE id=resource_id AND providers.organization_id=leads.organization_id AND status='approved'))
 )) OR (user_id IS NULL AND guest_session_id=inquiry_guest_actor() AND guest_inquiry_destination_valid(resource_type,resource_id,organization_id,agent_id,resource_version,inquiry_city,floor_plan_id,floor_plan_version,inquiry_intent))
);
