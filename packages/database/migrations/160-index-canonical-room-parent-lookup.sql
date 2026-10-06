-- Parent validation runs for every canonical unit mutation. Preserve its guard,
-- with a bounded indexed lookup instead of scanning all existing properties.
CREATE INDEX units_parent_room_lookup ON units(parent_unit_id) WHERE parent_unit_id IS NOT NULL;
