# Private CPU render commits — 9 October 2026

## Acceptance
Prework for HE-B04/C01/C03/C04. No full task acceptance; 15/95 accepted, 80 unfinished.

## Implementation
API-owned dispatch checks current creator, workspace/run version, source revision, every evidence grant and deadline. It seals the graph, queues only roots and writes the redacted activity/outbox event atomically. Duplicate/stale dispatch cannot create another event.

The authenticated collect-renders command accepts actual isolated PDFium/upright-image results only. It validates confinement metadata, affine transforms, contiguous pages, pinned versions, pixel/byte budgets, PNG dimensions and hashes, and rechecks source bytes. Conditional private storage creation plus stored hash verification supports lost-DB-commit recovery. No transaction spans transfer. A final current-actor/lease/fence/revision/grant check precedes immutable private artifacts, stage success and dependent-stage queuing. Sequential replay checks current authority and the original source fingerprint. Receipts/events expose opaque IDs only. Contract generators now expose 346 operations; OpenAPI describes the separate coordinator HMAC/timestamp.

## Tests
`./test-runner-protocol.sh` passes five actual Node/Python/DB/S3 journeys (`validation/render-commit-budget.log`): existing raster/private-preview/native-fact transport, authorized source transfer/cancellation, real PNG commit, real PDF commit, and actual oversized PDF refusal. Render sources pass real ClamAV before scanned fixture rows are created. Tests revoke membership after preview transfer, verify no DB commit, restore authority and recover against the stored object. Sequential replay yields one artifact/event; invalid output, stale fence and superseded inputs deny. Success queues its dependency exactly once; oversized input commits nothing and leaves its dependency pending.

`flock -n /tmp/haven-integration.lock docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests run --rm --no-deps tests pnpm exec vitest run tests/integration/digitization-workflow.test.ts tests/integration/digitization-leases.test.ts tests/integration/digitization-worker-http.test.ts tests/integration/digitization-inputs.test.ts tests/integration/digitization-source-validation.test.ts tests/integration/digitization-source-scan.test.ts tests/integration/outbox.test.ts` passes 14 checks in seven files (`validation/run-render-integration-final.log`). New HTTP command authentication/schema/availability and adjacent SMTP/search recovery pass. The initial SMTP crash test failed because integration Mailpit was stopped (`validation/run-render-integration.log`); after starting isolated Compose Mailpit it passed.

Targeted lint, API types, canonical contracts and both ledgers pass (`validation/run-render-checks.log`). An initial implicit-array type error was corrected. An initial revocation fixture used agent authority to change membership; the DB correctly rejected it (`validation/render-commit-recovery.log`); the corrected admin fixture mutation passes. Failed logs remain intact.

## Limitations
Dedicated queue/coordinator, terminal failure reconciliation, expired-lease recovery, generic completion callbacks and concurrent receipt replay recovery remain unfinished. Attempt rows stay immutable. Uncommitted previews remain private; HE-K02 cleanup is pending. Source page/candidate persistence, OCR, review UI, exact-revision owner-grant bootstrap and large-capture scan policy remain unfinished. Rendering does not assert geometry/facts, publication readiness or full engine eligibility. No full CI/build, GPU training, country benchmark or headset test was run for this slice.

## Next dependency
Finish HE-B04/B05 eligibility/revision grants, dedicated coordinator and guarded result reconciliation, then page/OCR/candidate review persistence. Continue independent editor/tour work. R1–R4 remain required.

## O
No customer sources or original benchmark dataset.

## R
Supplied source privacy, durable workflow, revision/fencing, budgets and independent publication requirements.

## P
Actual synthetic PDF/PNG, isolated CPU decoding, ClamAV, PostgreSQL, private S3 and Nest/Fastify tests.

## V
Full engine, country accuracy, original-site parity, GPU/scene/device/headset acceptance remain unverified. No task marked done.
