-- Inventory owns immutable capture completion receipts. Completion is not malware,
-- decoder or publication approval; downstream stages must pass their own gates.
CREATE TABLE digitization_capture_receipts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),digitization_id uuid NOT NULL REFERENCES property_digitizations,
 organization_id uuid REFERENCES organizations,created_by uuid NOT NULL REFERENCES profiles,version int NOT NULL DEFAULT 1 CHECK(version=1),created_at timestamptz NOT NULL DEFAULT now(),
 capture_id uuid NOT NULL UNIQUE,checksum text NOT NULL CHECK(checksum~'^[a-f0-9]{64}$'),byte_size bigint NOT NULL CHECK(byte_size BETWEEN 16 AND 2147483648),
 detected_mime text NOT NULL CHECK(detected_mime IN('video/mp4','video/quicktime')),
 status text NOT NULL DEFAULT 'quarantined' CHECK(status='quarantined'),
 FOREIGN KEY(capture_id,digitization_id) REFERENCES digitization_capture_uploads(id,digitization_id),UNIQUE(id,digitization_id)
);
ALTER TABLE digitization_capture_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY receipt_read ON digitization_capture_receipts FOR SELECT USING(created_by=actor_id() AND digitization_private_access(digitization_id));
CREATE POLICY receipt_create ON digitization_capture_receipts FOR INSERT WITH CHECK(created_by=actor_id() AND digitization_private_access(digitization_id));
CREATE FUNCTION digitization_capture_receipt_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE capture digitization_capture_uploads;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Immutable capture receipt required' USING ERRCODE='23514';END IF;
 SELECT * INTO capture FROM digitization_capture_uploads WHERE id=NEW.capture_id;
 IF capture.id IS NULL OR capture.state<>'complete' OR capture.created_by<>actor_id() OR NEW.created_by<>actor_id() OR capture.digitization_id<>NEW.digitization_id OR capture.organization_id IS DISTINCT FROM NEW.organization_id OR capture.expected_bytes<>NEW.byte_size OR capture.mime<>NEW.detected_mime OR NOT digitization_private_access(NEW.digitization_id) THEN
  RAISE EXCEPTION 'Current matching completed capture required' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER receipt_guard BEFORE INSERT OR UPDATE ON digitization_capture_receipts FOR EACH ROW EXECUTE FUNCTION digitization_capture_receipt_guard();
