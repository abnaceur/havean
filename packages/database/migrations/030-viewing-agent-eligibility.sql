-- Recheck eligibility in the insertion statement as well as the API preflight.
-- This preserves actor scope while preventing an unassigned/expired agent booking.
CREATE POLICY viewing_eligible_agent ON viewings AS RESTRICTIVE FOR INSERT
WITH CHECK(EXISTS(SELECT 1 FROM public_listing_agents(listing_id) eligible WHERE eligible.id=agent_id));
