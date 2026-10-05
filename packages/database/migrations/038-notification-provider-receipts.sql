ALTER TABLE notifications ADD COLUMN email_status text CHECK(email_status='accepted');
ALTER TABLE notifications ADD COLUMN provider_message_id text;
ALTER TABLE notifications ADD COLUMN acceptance_recorded_at timestamptz;
