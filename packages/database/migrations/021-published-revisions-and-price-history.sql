ALTER TABLE listing_revisions ADD COLUMN base_version int, ADD COLUMN version int NOT NULL DEFAULT 1, ADD COLUMN reviewed_by uuid REFERENCES profiles, ADD COLUMN review_reason text, ADD COLUMN reviewed_at timestamptz;
UPDATE listing_revisions r SET base_version=coalesce((changes->>'version')::int,l.version) FROM listings l WHERE l.id=r.listing_id;
ALTER TABLE listing_revisions ALTER COLUMN base_version SET NOT NULL;
ALTER TABLE listing_revisions ADD CONSTRAINT revision_state CHECK(status IN('pending','approved','rejected'));
-- Earlier unfinished revisions remain available for rejection; only newly submitted
-- revisions are serialized by the locked listing in the API.
DROP POLICY revision_scope ON listing_revisions;
CREATE POLICY revision_scope ON listing_revisions USING(actor_id=public.actor_id() OR staff_scope() OR review_scope()) WITH CHECK(actor_id=public.actor_id() OR staff_scope() OR review_scope());
CREATE TABLE listing_price_history(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), listing_id uuid NOT NULL REFERENCES listings,
 revision_id uuid NOT NULL UNIQUE REFERENCES listing_revisions,
 previous_price numeric(18,2), next_price numeric(18,2) NOT NULL CHECK(next_price>0),
 currency text NOT NULL, actor_id uuid REFERENCES profiles,
 private_reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE listing_price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY price_history_scope ON listing_price_history USING(listing_id IN(SELECT id FROM listings WHERE owner_id=actor_id() OR organization_id=org_id() OR staff_scope() OR review_scope())) WITH CHECK(staff_scope() OR review_scope());
CREATE TRIGGER immutable_price_history BEFORE UPDATE OR DELETE ON listing_price_history FOR EACH ROW EXECUTE FUNCTION immutable_listing_history();
CREATE VIEW public_listing_price_history WITH(security_barrier=true) AS
 SELECT h.id,h.listing_id,h.previous_price::text AS previous_price,h.next_price::text AS next_price,h.currency,h.created_at,'Approved asking price update'::text AS reason
 FROM listing_price_history h JOIN listings l ON l.id=h.listing_id WHERE l.status='published';
CREATE VIEW public_listing_status_history WITH(security_barrier=true) AS
 SELECT h.id,h.listing_id,h.next_status AS status,h.created_at
 FROM listing_status_history h JOIN listings l ON l.id=h.listing_id WHERE l.status='published' AND h.next_status IN('published','paused','sold','leased','expired','archived');
