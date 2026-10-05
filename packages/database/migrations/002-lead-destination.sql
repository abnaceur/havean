CREATE POLICY lead_destination ON leads AS RESTRICTIVE FOR INSERT WITH CHECK(
 organization_id=org_id() OR staff_scope() OR
 (user_id=actor_id() AND (
  (resource_type='listing' AND EXISTS(SELECT 1 FROM listings WHERE id=resource_id AND listings.organization_id=leads.organization_id AND status='published')) OR
  (resource_type='development' AND EXISTS(SELECT 1 FROM developments WHERE id=resource_id AND developments.organization_id=leads.organization_id AND status IN ('on_sale','coming_soon'))) OR
  (resource_type='agent' AND EXISTS(SELECT 1 FROM agents WHERE id=resource_id AND agents.organization_id=leads.organization_id)) OR
  (resource_type='provider' AND EXISTS(SELECT 1 FROM providers WHERE id=resource_id AND providers.organization_id=leads.organization_id AND status='approved'))
 ))
);
