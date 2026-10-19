-- Private, incomplete authoring progress; canonical listing facts remain in listings.
CREATE TABLE property_authoring_drafts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES profiles(id),
 organization_id uuid REFERENCES organizations(id),
 listing_id uuid REFERENCES listings(id),
 data jsonb NOT NULL CHECK(jsonb_typeof(data)='object'),
 step integer NOT NULL DEFAULT 0 CHECK(step BETWEEN 0 AND 3),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX property_authoring_one_listing ON property_authoring_drafts(user_id,listing_id) WHERE status='draft' AND listing_id IS NOT NULL;
CREATE INDEX property_authoring_recent ON property_authoring_drafts(user_id,updated_at DESC);
ALTER TABLE property_authoring_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_authoring_drafts FORCE ROW LEVEL SECURITY;
CREATE POLICY property_authoring_private ON property_authoring_drafts
 USING(user_id=actor_id() AND organization_id IS NOT DISTINCT FROM org_id())
 WITH CHECK(user_id=actor_id() AND organization_id IS NOT DISTINCT FROM org_id());
