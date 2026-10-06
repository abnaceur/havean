-- Personal reads do not depend on a staff-selected organization; team reads use actual authority.
ALTER POLICY tenant_current_manager_scope ON tenants USING(user_id=actor_id() OR management_admin() OR managed_tenant_visible(id));
