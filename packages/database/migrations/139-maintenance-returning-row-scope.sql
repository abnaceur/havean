-- RETURNING evaluates the new row's policy before an existing-row lookup port can
-- observe it. Admit the exact same persisted lease/actor authority from NEW fields.
ALTER POLICY maintenance_current_scope ON maintenance USING(management_admin() OR maintenance_manager(organization_id) AND EXISTS(SELECT 1 FROM leases l WHERE l.id=lease_id AND management_unit_granted(l.unit_id,l.organization_id)) OR user_id=actor_id() AND tenant_lease_access(lease_id));
