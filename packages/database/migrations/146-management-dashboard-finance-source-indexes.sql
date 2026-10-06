-- Scope financial report lookups to their linked source rather than repeated scans.
CREATE INDEX allocations_charge_recorded ON allocations(charge_id,created_at) INCLUDE(amount,payment_id,reversed_at);
CREATE INDEX payments_lease_recorded ON payments(lease_id,created_at);
CREATE INDEX maintenance_organization_recorded ON maintenance(organization_id,created_at,lease_id);
