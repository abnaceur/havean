ALTER TABLE leads DROP CONSTRAINT development_inquiry_fields;
ALTER TABLE leads ADD CONSTRAINT development_inquiry_fields CHECK((floor_plan_id IS NULL AND floor_plan_version IS NULL AND inquiry_intent='general') OR (resource_type='development' AND floor_plan_id IS NOT NULL AND floor_plan_version IS NOT NULL AND floor_plan_version>0 AND resource_version IS NOT NULL AND resource_version>0));
