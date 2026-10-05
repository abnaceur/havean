ALTER TABLE units DROP CONSTRAINT explicit_room_parent;
ALTER TABLE units ADD CONSTRAINT explicit_room_parent CHECK(
 (unit_kind='property' AND parent_unit_id IS NULL AND room_label IS NULL)
 OR (unit_kind='room' AND parent_unit_id IS NOT NULL AND room_label IS NOT NULL AND length(trim(room_label)) BETWEEN 1 AND 80)
);
