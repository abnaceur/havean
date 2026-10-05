-- Moderators may create canonical inventory only through the reviewed submission API.
CREATE POLICY reviewer_unit_insert ON units FOR INSERT WITH CHECK(review_scope());
