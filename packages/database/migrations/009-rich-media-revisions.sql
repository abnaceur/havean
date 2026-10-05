ALTER TABLE listing_media ADD COLUMN pending_metadata jsonb;
ALTER TABLE listing_media ADD COLUMN pending_title text;
ALTER TABLE listing_media ADD COLUMN pending_position integer;
