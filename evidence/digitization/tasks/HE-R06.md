## Acceptance
Define outbox event dispatch routing and engine consumer effect ownership. Verified for the supplied first-slice small private document/image scope.

## Implementation
Generic platform dispatch excludes digitization events and rejects accidental engine deliveries. Dedicated queue dispatch stamps only after enqueue and uses stable event IDs. SQL170 stores consumer-owned execution receipts atomically with API-owned leases. Unknown engine event versions fail closed. Concurrent/repeated deliveries reuse one execution and private result.

## Tests
`flock -n /tmp/haven-integration.lock docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests run --rm --no-deps tests pnpm exec vitest run tests/integration/viewing-reminders.test.ts tests/integration/digitization-outbox-routing.test.ts tests/integration/digitization-worker-http.test.ts tests/integration/digitization-source-scan.test.ts` — passed.
`./test-runner-protocol.sh` — passed.
Logs: validation/revision-coordinator-regressions.log (24 checks), validation/coordinator-platform-regressions.log (10), validation/coordinator-cpu-final.log (69 CPU checks), validation/coordinator-fencing-final.log (six real transport/DB/storage/queue journeys). API/worker types, 348 generated operations, targeted lint and import boundaries pass in validation/coordinator-final-checks-corrected.log.

## Limitations
This task acceptance does not complete the engine. OCR, candidates/review UI, long-outage reconciliation, cancellation delivery, full capture processing, scene/GPU/device/headset and country benchmarks remain separate unfinished tasks. Private renders are privacy-pending and never publication authority.

## Next dependency
Continue HE-C05–C10 and private page/OCR/review pipeline under their exact acceptance gates.

## O
No customer source or original-site parity approval.

## R
Supplied digitization specification, first-slice scope and current exact actor/revision/fencing requirements.

## P
Actual synthetic files, ClamAV, isolated native decoder, PostgreSQL, private S3, Nest API and BullMQ were exercised; no simulated reconstruction.

## V
No external country, GPU reconstruction, scene publication, headset or full-engine approval.

## Earlier implementation history
Historical descriptions below predate this acceptance and are retained with earlier failures.

# HE-R06 — Outbox ownership guard (in progress)

## Acceptance
Required final acceptance is that engine events cannot be swallowed by the generic consumer and duplicate deliveries create one actual engine execution. Only the routing/ownership guard is implemented; this task is not done.

## Implementation
packages/contracts/src/outbox-routing.ts; apps/worker/src/main.ts excludes digitization-prefixed rows from the platform relay; processor.ts rejects mismatched engine events before any effect/acknowledgement; docs/adr/digitization-outbox.md; tests/integration/digitization-outbox-routing.test.ts.

## Tests
pnpm test:integration
Executed in the stable isolated snapshot's ./ci.sh integration lane: two real PostgreSQL ownership tests passed alongside legacy search/reminder/outbox tests. New and unknown engine-prefixed events remain unprocessed with no platform effect; duplicate platform delivery retains one consumer effect. Full CI later failed visual comparisons; no global success is claimed.

## Limitations
There is no engine producer, dedicated queue consumer or actual engine execution yet. Unhandled engine events stay pending fail-closed. Duplicate actual engine execution acceptance awaits HE-C01/C02/C03/C04 and cannot be replaced by the existing platform-effect test.

## Next dependency
Implement scoped persisted run/stages and engine dispatcher with stable IDs and leases. HE-A04/B05/C01 precede actual C02 dispatch.

## O
No original reference capture.

## R
Existing outbox/effects ownership and supplied engine dispatch requirements.

## P
Actual isolated database ownership/replay tests.

## V
Real engine dispatch/recovery/execution remains unverified; no publication/production approval.
