# HE-R02 — Shared checked inventory access and private processing authority contract

## Acceptance
Legacy editable-property check extracted without changing behaviour. Engine target and document preview ports recheck persisted active identity, selected agency membership, assignment and owner/reviewer evidence expiry. Agency target access never opens an owner's deed; the search worker/admin label alone cannot authorize engine authoring. ADR defines the separate explicit processing grant and narrow runner identity required before execution.

## Implementation
apps/api/src/inventory/property-access.ts; rich-media.ts reuses editableProperty; docs/adr/digitization-access.md; tests/integration/digitization-access.test.ts. No runner or agency processing grant is inferred from a preview grant.

## Tests
pnpm test:integration
Executed by ./ci.sh in the tests container. Stable detached fb59567 validation checkout plus engine changes passed all 212 integration tests, including three new current-grant tests, owner-evidence, approved-tours and legacy outbox checks. New tests use real PostgreSQL, rollback fixtures and scope changes to exercise expired owner/reviewer grants, completed submission, reassignment, revoked persisted membership, cross-agency denial and privileged worker denial. Full command later failed visual comparisons; this is integration-lane evidence only.

flock -n /tmp/haven-integration.lock docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests run --rm --no-deps tests pnpm exec playwright test tests/e2e/rich-media.spec.ts tests/e2e/spatial-tour.spec.ts --project=desktop --project=mobile
Seven passed; desktop development-media hit temporary public BFF 503. Both listing authorization/review flows, upload rejections and spatial flows passed desktop/mobile.

flock -n /tmp/haven-integration.lock docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests run --rm --no-deps tests pnpm exec playwright test tests/e2e/rich-media.spec.ts --project=desktop --grep 'development floor-plan drawings'
Rerun passed 1/1 in the unchanged stable checkout; original failure remains recorded rather than erased.

## Limitations
This task documents processing grant and runner capability requirements; they are not yet persisted or active. HE-A04/B01/C03 must implement them before OCR dispatch. Private intakes/development targets and same-unit/two-mandate engine run access remain subsequent tasks. Broad legacy editable behaviour is preserved rather than retroactively claiming stricter engine checks were historically enforced. Full live-head CI/visual parity remain unverified.

## Next dependency
HE-A04 scope/grant/table migrations after the actual current maximum; HE-B01 explicit intake/processing authority; HE-R03/R04/R07 scoped adapters.

## O
No original private reference capture.

## R
Existing inventory and owner/moderation evidence authority; supplied engine separation requirements.

## P
Actual real database and authenticated desktop/mobile browser regression evidence, screenshots provisional.

## V
No engine processing/publication/security completion or visual/production approval.
