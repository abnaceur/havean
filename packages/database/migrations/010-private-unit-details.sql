-- Published unit facts and private addresses have distinct read policies.
CREATE TABLE unit_private_details(
 unit_id uuid PRIMARY KEY REFERENCES units ON DELETE CASCADE,
 organization_id uuid NOT NULL REFERENCES organizations,
 private_address text NOT NULL,
 version integer NOT NULL DEFAULT 1
);
INSERT INTO unit_private_details(unit_id,organization_id,private_address) SELECT id,organization_id,private_address FROM units;
ALTER TABLE units DROP COLUMN private_address;
ALTER TABLE unit_private_details ENABLE ROW LEVEL SECURITY;
CREATE POLICY private_unit_write ON unit_private_details USING(staff_scope() OR review_scope() OR (organization_id=org_id() AND NOT manager_only()))
 WITH CHECK(staff_scope() OR review_scope() OR (organization_id=org_id() AND NOT manager_only()));
CREATE POLICY private_unit_owner ON unit_private_details FOR SELECT USING(unit_id IN(SELECT unit_id FROM listings WHERE owner_id=actor_id()));
CREATE POLICY private_unit_manager ON unit_private_details FOR SELECT USING(unit_id IN(SELECT unit_id FROM management_grants WHERE organization_id=org_id() AND expires_at>now()));
CREATE POLICY private_unit_tenant ON unit_private_details FOR SELECT USING(unit_id IN(SELECT unit_id FROM leases WHERE status='active' AND tenant_id IN(SELECT id FROM tenants WHERE user_id=actor_id())));
CREATE POLICY private_unit_agent ON unit_private_details AS RESTRICTIVE USING(NOT agent_only() OR unit_id IN(SELECT unit_id FROM listings WHERE agent_id IN(SELECT id FROM agents WHERE user_id=actor_id()) OR owner_id=actor_id()));
-- Qualify the function to avoid comparing a column to itself.
DROP POLICY revision_scope ON listing_revisions;
CREATE POLICY revision_scope ON listing_revisions USING(actor_id=public.actor_id() OR staff_scope() OR review_scope()) WITH CHECK(actor_id=public.actor_id() OR staff_scope());
CREATE POLICY agent_private_listing_read ON listings AS RESTRICTIVE FOR SELECT USING(NOT agent_only() OR status='published' OR owner_id=actor_id() OR agent_id IN(SELECT id FROM agents WHERE user_id=actor_id()));
