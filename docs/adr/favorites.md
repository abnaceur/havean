# Persistent favorites

Favorites belong to the authenticated actor. Read and mutation endpoints never accept another user ID. PostgreSQL's unique user/listing key and row security reinforce that scope. Removed entries remain as versioned tombstones. Writes require the saved-state version, and saves additionally verify the current public listing version and availability. A per-user/listing transaction lock serializes concurrent requests. Same-key retries return the original response; repeated desired-state writes at the current version leave the version unchanged. Actual state changes append audit and outbox events atomically.

The browser shows the proposed heart state while the request runs, ignores repeated clicks during that request, and restores the prior state on failure. Account-specific query keys and optimism keep users isolated. Conflicts refresh authoritative state. An expired save clears private query data and resumes through the normal PKCE sign-in flow.

Only an explicit save click creates a login-return intent. Session storage binds it to the exact return path and query for ten minutes. Successful login consumes it once and requests Save rather than Toggle, so an already saved property is not accidentally removed. Invalid, expired or mismatched intents cannot mutate anything. When session storage is unavailable, the user is told to save again after sign-in. No access token or identity data is stored in this intent.

This account workflow is P. Previously observed public navigation remains O, public capability text remains R, and original account visual parity remains V. Availability of saved but withdrawn properties is the following A03 task.
