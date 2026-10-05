CREATE TABLE moderation_evidence_grants(
 reviewer_id uuid NOT NULL REFERENCES profiles,
 submission_id uuid NOT NULL REFERENCES owner_submissions,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(reviewer_id,submission_id)
);
ALTER TABLE moderation_evidence_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY reviewer_grant_scope ON moderation_evidence_grants
 USING((review_scope() OR staff_scope()) AND reviewer_id=actor_id())
 WITH CHECK((review_scope() OR staff_scope()) AND reviewer_id=actor_id());
CREATE INDEX moderation_grant_expiry ON moderation_evidence_grants(expires_at);
