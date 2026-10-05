# Normalized saved searches

The API owns normalization, city/currency boundaries, geography membership, versions and eligibility. A saved search records canonical filter strings, explicit city/currency, schema version, cadence, pause state and row version. Pagination and unknown criteria are rejected. Canonical listing validation also rejects inverted price/area ranges and incompatible rental criteria. Location IDs must belong to the selected city; duplicate facets are normalized. Rental searches without a period receive the configured market period.

Creation expects version zero. Edits, pause/resume and deletion lock the own active row and require its current version. Request-key replay is idempotent; audit/outbox are atomic. Deletion retains a paused tombstone, and stale edits cannot recreate it. Legacy unvalidated searches start paused at criteria version zero and require an explicit review/edit before eligibility. Their criteria are never silently converted into active alerts.

The API returns a restore URL for the normalized city/category/criteria. Editing criteria reuses the existing results filters; edit context survives Apply/Reset and text search, while public API requests exclude that private context parameter. Name, cadence and pause preferences use a separate accessible dialog. A stale dialog blocks save until the user reloads the current search. Mobile account navigation brings the selected tab into horizontal view without scrolling the page vertically.

Matching reads current SQL public eligibility through the canonical filter compiler, explicitly scopes city and currency, and omits paused, deleted or unreviewed searches. It returns at most 50 current matches and does not claim a complete count above that limit. City/currency changes make matching ineligible until the search is reviewed. The preference UI does not claim an email has been delivered; delivery/preferences/deduplicated digests follow in A05.

This personal workflow is P. Previous public navigation/filter evidence remains O/R, and original account/saved-search visual parity is V. No benchmark account implementation or screen measurements have been asserted.
