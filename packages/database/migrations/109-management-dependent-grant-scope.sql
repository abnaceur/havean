-- Professional property and finance reads follow current grant authority even for finance-only actors.
ALTER POLICY active_manager_lease_grant ON leases USING(org_id() IS NULL OR management_admin() OR management_unit_granted(unit_id,organization_id));
ALTER POLICY active_manager_charge_grant ON charges USING(org_id() IS NULL OR management_admin() OR lease_id IN(SELECT id FROM leases));
ALTER POLICY active_manager_payment_grant ON payments USING(org_id() IS NULL OR management_admin() OR lease_id IN(SELECT id FROM leases));
ALTER POLICY active_manager_deposit_grant ON deposits USING(org_id() IS NULL OR management_admin() OR lease_id IN(SELECT id FROM leases));
ALTER POLICY active_manager_allocation_grant ON allocations USING(org_id() IS NULL OR management_admin() OR payment_id IN(SELECT id FROM payments));
ALTER POLICY active_manager_maintenance_grant ON maintenance USING(org_id() IS NULL OR management_admin() OR lease_id IN(SELECT id FROM leases));
