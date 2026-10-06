# Consented analytics and redacted audit

**P** aggregate analytics, **O** property/support discovery structure, **R** original
capability names, **V** exact reference geometry and production launch remain separate.

Six events are declared: `listing_impression`, `listing_view`, `favorite_added`,
`inquiry_submitted`, `viewing_requested`, `quote_requested`. Current property cards
record impressions only after half their card intersects the viewport, a signed-in
account has saved opt-in, and API checks the current eligible property/version.
The existing property-view endpoint requires explicit consent. Saved opt-out denies
future views and impressions even if a stale page retains a true preference.
Other business signals require saved optional analytics consent; guest and
non-opted-in requests still function and do not enter optional analytics.

Preferences are owned, versioned, state checked, active-account scoped and included
in the existing private export port. Native browser preference changes persist in
API sessions; device storage is not the consent authority. Earlier aggregate counts
remain after opt-out, which is explained to the user. Unknown source events and
private message/document activity do not enter the projection.

The administration-owned SQL capture port reads transactional business outbox
metadata through inventory/geography, engagement and services relations; it mutates
only its declared analytics ledger. It strips payloads completely. Ledger fields are
source outbox ID, declared kind, city/category snapshot, opaque SHA-256 deduplication
key and time. No private text, contact, identity document or private address is
copied. Listing impressions/views/saves dedupe account/property/UTC day; request
signals dedupe committed request/account/day. Same source ID also has a unique key.
No pre-activation history is inferred or backfilled. Counts describe optional
signals, not every visitor, unique visitors, a cohort or a conversion probability.

The worker periodically calls `project_analytics_batch`, a bounded stored port.
It locks unprocessed source rows with SKIP LOCKED, increments daily counts and marks
the source in one transaction. Crashes roll back both; concurrent/replayed batches
cannot duplicate an increment. The port requires an actual active platform admin
service actor (current existing worker principal); a forged role flag is insufficient.
Application table policies allow neither ledger edits nor aggregate counter writes.
SQL 157 corrects an ambiguous trigger variable; SQL 158 maps explicit agent and provider inquiry scopes. Applied migrations remain unchanged.

Actual current platform administrators can filter UTC inclusive periods of at most
366 days, city and category. Reports expose six exact declared counts, query time
and matched unprojected source count. Filtered CSV contains aggregate fields only.
Audit search reads immutable event ID, actor/resource IDs, action code and UTC time;
known-code format, exact filters, bounded pages and private payload exclusion apply.
Neither private review reasons nor messages, documents or contact fields enter it.
Historical event city/category stays a snapshot and never establishes current
availability. Analytics does not influence authorization or source property facts.

Trusted synthetic integration source fixtures are labelled separately from native
business admission. The six-kind count test uses real view/impression/consent APIs
and the transactional event port with trusted inquiry/booking/quote sources;
it does not claim six native business workflows were exercised in that test.
Existing native business suites remain the admission evidence.
