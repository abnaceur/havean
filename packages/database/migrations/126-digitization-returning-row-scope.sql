-- INSERT RETURNING SELECT checks must use the candidate row, not look up a row
-- before PostgreSQL has made it visible to the policy's helper snapshot.
DROP POLICY digitization_read ON property_digitizations;
CREATE POLICY digitization_read ON property_digitizations FOR SELECT USING(
 state='active' AND digitization_actor_target(actor_id(),organization_id,created_by,target_type,target_id,unit_id) AND
 (organization_id IS NULL OR organization_id=org_id() OR EXISTS(SELECT 1 FROM listings l WHERE target_type='listing' AND l.id=target_id AND l.owner_id=actor_id()))
);
