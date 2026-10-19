## Acceptance
Build independent gallery from approved photos. Accepted after HE-F01.
Minimum: Failed reconstruction does not hide approved gallery.

## Implementation
API-owned publicApprovedGallery uses the existing approved property media projection and filters photo kind. It never gates gallery on reconstruction/run state, draft artifacts or input revisions. New GET /api/v1/:resource/:id/gallery resolves the currently published listing or eligible development under anonymous RLS and returns only the existing safe photo presentation. Current media approval, source approval/scan/public visibility/purpose and display variant remain mandatory. No private storage key or evidence enters the response. Existing combined media/tour endpoint and moderation are preserved; no new mutation or bypass. Canonical response explicitly allows photo kind only and OpenAPI declares this existing public publication boundary.

## Tests
`flock -n /tmp/haven-integration.lock docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration api pnpm exec vitest run tests/integration/digitization-gallery.test.ts` passes one actual database/public-RLS check in gallery-independent-real-database.log. Same-property reconstruction stages transition queued/leased/running/failed_terminal and run failed; gallery remains byte-for-byte unchanged. Private, draft and unscanned photos are excluded; revocation removes the remaining approved photo. Fixture rollback restores all changes. This is synthetic approval/failure policy metadata, not actual human approval or GPU reconstruction.
Full units142/46, all nine types, lint/boundaries,375-operation canonical contracts and compiled API154files pass: gallery-full-units.log, gallery-final-all-types.log, gallery-final-lint.log, gallery-contracts-check.log and gallery-compiled-api.log. Initial generation/typecheck correctly failed on the missing explicit response schema; corrected runs pass and failures remain retained.

## Limitations
This task provides independently approved gallery delivery through the existing inventory API. Full tab/UI assembly is separately HE-I01. It does not approve draft captures or reconstruction derivatives, create public packages, or certify customer/device/human review.

## Next dependency
HE-I01 existing PropertyMedia tabs after its other prerequisites; continue HE-F02 extraction.

## O
Actual PostgreSQL RLS and transitions with self-authored synthetic policy metadata.

## R
Original specification, approval policy and Abu Dhabi/fixed-empty rule preserved.

## P
Real API implementation, canonical schemas and retained local test evidence.

## V
No customer measurement, actual human approval, GPU benchmark, production or whole-engine completion.
