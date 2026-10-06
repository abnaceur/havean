-- Immutable actor IDs survive reviewed account removal, matching the existing audit log.
ALTER TABLE agency_membership_history DROP CONSTRAINT agency_membership_history_actor_id_fkey;
