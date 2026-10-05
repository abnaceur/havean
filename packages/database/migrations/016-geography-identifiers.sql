-- Original geography tables used seed-assigned UUIDs. Administration creates real records.
ALTER TABLE cities ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE districts ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE communities ALTER COLUMN id SET DEFAULT gen_random_uuid();
