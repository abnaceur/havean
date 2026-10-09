## Acceptance
Extend existing event/outbox ownership and engine consumer dispatch; retain platform effects. Verified for the supplied first-slice small private document/image scope.

## Implementation
A real dedicated BullMQ consumer invokes authenticated API commands using persisted initiating identity. API alone reconstructs current memberships and validates every scoped command. Durable event receipts recover before/after enqueue crashes and replay without duplicate effects. Platform search, SMTP and reminder handling retain their separate consumer and pass real regressions.

## Tests
`flock -n /tmp/haven-integration.lock docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests run --rm --no-deps tests pnpm exec vitest run tests/integration/digitization-revision-authority.test.ts tests/integration/digitization-source-validation.test.ts tests/integration/digitization-workflow.test.ts tests/integration/digitization-schema.test.ts tests/integration/digitization-inputs.test.ts tests/integration/digitization-intakes.test.ts tests/integration/digitization-leases.test.ts tests/integration/outbox.test.ts` — passed.
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
