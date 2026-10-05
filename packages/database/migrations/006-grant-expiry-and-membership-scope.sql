-- Platform roles are independent of an organization. Other permissions are evaluated
-- only against the organization selected from the actor's active memberships.
UPDATE memberships SET organization_id=NULL WHERE role IN ('admin','moderator','support','editor');
CREATE FUNCTION manager_only() RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT coalesce(current_setting('app.manager_only',true),'false')='true'
$$;
CREATE POLICY active_manager_lease_grant ON leases AS RESTRICTIVE USING(
 NOT manager_only() OR unit_id IN(SELECT unit_id FROM management_grants WHERE organization_id=org_id() AND expires_at>now())
);
CREATE POLICY active_manager_charge_grant ON charges AS RESTRICTIVE USING(NOT manager_only() OR lease_id IN(SELECT id FROM leases));
CREATE POLICY active_manager_payment_grant ON payments AS RESTRICTIVE USING(NOT manager_only() OR lease_id IN(SELECT id FROM leases));
CREATE POLICY active_manager_deposit_grant ON deposits AS RESTRICTIVE USING(NOT manager_only() OR lease_id IN(SELECT id FROM leases));
CREATE POLICY active_manager_allocation_grant ON allocations AS RESTRICTIVE USING(NOT manager_only() OR payment_id IN(SELECT id FROM payments));
CREATE POLICY active_manager_maintenance_grant ON maintenance AS RESTRICTIVE USING(NOT manager_only() OR lease_id IN(SELECT id FROM leases));
