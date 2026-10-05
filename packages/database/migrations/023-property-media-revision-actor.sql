ALTER TABLE listing_media ADD COLUMN pending_submitted_by uuid REFERENCES profiles(id);
-- Legacy revisions retain their recorded uploader; new revisions record the actual editor.
UPDATE listing_media SET pending_submitted_by=submitted_by WHERE pending_metadata IS NOT NULL;
