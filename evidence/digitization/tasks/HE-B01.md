# HE-B01 — Current target and explicit evidence authority

## Acceptance
Current Identity.actor, persisted active agency membership/role, listing assignment, canonical unit mandate and owner grants protect engine creation/reads. Private intake creates no canonical unit or geography. Agency authority alone cannot open another owner's deed or another agency's run on the same unit. Owner-specific evidence grants are explicit, consented, versioned, revision/purpose/time bounded and recheck recipient authority.

## Implementation
apps/api/src/inventory/digitization/{controller,intakes}.ts; packages/contracts/src/digitization-intake.ts; generated API operations/OpenAPI/responses via existing generators; migration 130-digitization-grant-revision-existence.sql. Every write uses current authority before idempotency receipt, strict body/UUID validation and current version/workflow checks. Responses expose sanitized explicit target identities, not source/object storage keys. Inventory-owned outbox/audit stores IDs only. Independent publishing is not granted.

## Tests
`flock -n /tmp/haven-integration.lock docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests run --rm --no-deps tests sh -c 'pnpm db:migrate && pnpm exec vitest run tests/integration/digitization-intakes.test.ts tests/integration/digitization-schema.test.ts tests/integration/digitization-access.test.ts'`
Passed 13 checks (4 intake service tests, 6 scoped schema tests, 3 legacy/current access regressions) on 6 October 2026; retained intakes.log. Includes two active agency mandates for one canonical unit, explicit owner grant to one workspace, denial of the other agency's private deed/run; duplicate receipt, changed-body conflict, revoked membership/reassignment, listing version conflict and no listing publication mutation. Actual migration 130 applied. Current typecheck passed; existing contract generation/check passed.

## Limitations
Source revision/binding endpoints follow HE-B05; intake attach/apply follows HE-R07/D10. Owner route currently serves authorized owner listings; owner-submission and development adapters remain separate. No upload/processing/publication completion is implied. All historical binding authority remains conservative pending revision-specific HE-B05/C10 work.

## O
No original owner deed.
## R
Supplied two-mandate/evidence lineage and existing owner evidence policy.
## P
Real PostgreSQL RLS/service/idempotency tests with isolated synthetic fixtures.
## V
No engine browser review, OCR/model, publication or R1–R4 acceptance.

## Next dependency
Continue the next scoped engine task documented above; the full release is unfinished.
