-- An owner identity cannot grant an unrelated unit by supplying its UUID.
DROP POLICY mandate_scope ON listing_mandates;
CREATE POLICY mandate_scope ON listing_mandates USING(organization_id=org_id() OR owner_id=actor_id() OR staff_scope()) WITH CHECK(staff_scope() OR (owner_id=actor_id() AND unit_id IN(SELECT unit_id FROM listings WHERE owner_id=actor_id())));
