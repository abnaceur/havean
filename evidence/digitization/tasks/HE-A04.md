# HE-A04 — Inventory-owned scoped persistence

## Acceptance
Additive migrations 124–129 create the engine relational ledger with existing organization/creator/explicit listing, intake, owner-submission or development-floor-type identities. Current persisted target/evidence authority gates RLS; canonical units shared by mandates do not share private inputs or outputs. Matching parent/org/revision/run relations, immutable snapshots and optimistic versions are enforced. No administrator/worker role bypass or publication write policy is introduced.

## Implementation
packages/database/migrations/124-digitization-scoped-ledger.sql through 129-digitization-snapshot-identity.sql; docs/adr/modules.json inventory table ownership; tests/integration/digitization-schema.test.ts. Tables include source revisions/bindings, explicit owner evidence grants, pages/candidates/append-only decisions, geometry/capture, runs/stages/dependencies/attempts/artifacts, tours/approvals/packages and sequenced events. Property scope identity remains Haven's organization plus existing resource authority; owner submissions may have no organization. Only exact source revision/version/purpose/time-bound grants enable non-owner private inputs. Public package and approval inserts are denied until independently guarded HE-J ports.

## Tests
docker compose exec -T api pnpm db:migrate
Existing development schema upgrades applied all six additive migrations. Initial real tests identified INSERT RETURNING policy visibility, generic-trigger field preparation and a purpose argument shadowed by media_assets.purpose; subsequent additive guards fix them without rewriting applied SQL or relaxing authority.

./test.sh pnpm exec vitest run tests/integration/digitization-schema.test.ts tests/integration/digitization-access.test.ts tests/integration/digitization-outbox-routing.test.ts tests/integration/owner-evidence.test.ts tests/integration/approved-tours.test.ts tests/integration/outbox.test.ts
Fresh isolated haven-integration reset/complete migrations/seed/startup and all selected tests passed on 6 October 2026. Six new schema tests cover actual RLS, denied privileged worker, duplicate active targets, two agency mandates on one canonical unit, no implicit deed access, valid explicit owner grant, timed expiry denial of private facts, revoked mandate/owner grant/reassignment, cross-org and cross-run references, immutable input/budget and stale version denial, private intake without fabricated inventory and author publication denial. Current legacy owner-document, approved-tour, search/outbox crash regressions remain passing. Retained scoped-ledger-fresh.log records exact counts and actual command context.

## Limitations
SQL is persistence authority, not completed runner/job/editor/upload/publishing flows. Legal stage transitions, fencing/callbacks and source-set invalidation are subsequent tasks. Current private child reads conservatively require every historical binding grant; HE-B05/C10 must narrow each immutable revision's access before permitting removal/replacement workflows. Model text/geometry payload validation belongs to API contracts/services. Approval/public-package tables are deliberately unwritable until HE-J. No OCR, country profile, GPU or device gate is implied.

## Next dependency
HE-A05 CPU/GPU deployment boundaries; HE-B01 checked intake/listing/grant APIs; HE-C01 persisted workflow after scanned immutable inputs.

## O
No original private document capture.

## R
Current mandatory platform docs and supplied engine table/scope requirements. Actual checkout had reserved migrations through 123 before these additions.

## P
Actual development upgrade plus real fresh PostgreSQL/Valkey/identity/storage/scanner stack and fault/authority regression fixtures. Fixtures rollback or use existing test isolation.

## V
Full R1–R4, private processing execution, visual parity, performance, restore, GPU/headset and production remain unverified.
