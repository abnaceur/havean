CREATE POLICY owner_grants ON management_grants FOR SELECT USING(owner_id=actor_id() AND expires_at>now());
CREATE POLICY owner_leases ON leases FOR SELECT USING(unit_id IN(SELECT unit_id FROM management_grants WHERE owner_id=actor_id() AND expires_at>now()));
CREATE POLICY owner_charges ON charges FOR SELECT USING(lease_id IN(SELECT id FROM leases));
CREATE POLICY owner_payments ON payments FOR SELECT USING(lease_id IN(SELECT id FROM leases));
CREATE POLICY owner_deposits ON deposits FOR SELECT USING(lease_id IN(SELECT id FROM leases));
