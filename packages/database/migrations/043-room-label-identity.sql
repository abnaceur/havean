CREATE UNIQUE INDEX room_label_identity ON units(parent_unit_id,lower(trim(room_label))) WHERE unit_kind='room';
