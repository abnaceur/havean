## Acceptance
Implement leases, fencing and callback idempotency. Verified for the supplied first-slice small private document/image scope.

## Implementation
API-owned bounded leases serialize execution admission, cap attempts, increment fences and check current initiating actor/source authority/revision/deadline. Completion rejects expired or replaced tokens before any artifact commit. Real runner test expires one execution, obtains fence 2 and proves late fence-1 completion cannot overwrite it. Concurrent and sequential completion replay returns the same private artifact receipt.

## Tests
`flock -n /tmp/haven-integration.lock docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests run --rm --no-deps tests pnpm exec vitest run tests/integration/digitization-revision-authority.test.ts tests/integration/digitization-source-validation.test.ts tests/integration/digitization-workflow.test.ts tests/integration/digitization-schema.test.ts tests/integration/digitization-inputs.test.ts tests/integration/digitization-intakes.test.ts tests/integration/digitization-leases.test.ts tests/integration/outbox.test.ts` — passed.
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

## Acceptance
Leases, fencing and callback idempotency. In progress: authenticated completion callbacks and guarded artifact commits remain unfinished.

## Implementation
API-owned `leases.ts` admits execution under actual current agency/creator, target/evidence, source revision, stage version and run state. Lease bounds and renewal use PostgreSQL statement time, unique execution IDs, increasing attempt/fence and immutable attempt records. The search worker/admin identity does not gain processing scope. Cancellation, expired leases, superseded source revisions and wrong execution/fence deny renewal. Transport and receipt logic are in HE-C03; no worker imports API internals.

## Tests
The host-locked actual PostgreSQL lease/workflow command passes six checks (`validation/lease-api-integration-final.log`). Exactly one attempt is admitted; duplicate old-version delivery, forged admin role, wrong execution/fence, actual expired lease and cancelled-run renewal reject. Existing SQL workflow checks reject late success on an expired/replaced lease. API types and targeted lint pass. These are API service/SQL tests, not an authenticated callback route acceptance.

## Limitations
No internal worker capability issuance, completion callback, authoritative output storage/checksum commit or public artifact approval yet. The fixture has an empty synthetic source set to isolate lease semantics; it does not prove OCR or source delivery from a Haven run.

## Next dependency
HE-C02 coordinator routing and HE-C03 fully scoped artifact/job delivery, then guarded callbacks and reconciliation.

## O
No customer documents.

## R
Supplied actor/grant/version/lease/fencing rules.

## P
Actual short API-owned PostgreSQL transactions and rejection tests.

## V
No complete coordinator recovery or publication acceptance.

## Authenticated command continuation — P, 7 October
Actual API internal lease/renew/prepare commands require a separate engine-purpose credential and reconstruct the initiating actor's current persisted roles; caller-supplied roles are rejected. Current-source request preparation checks run/lease/fence/revision/profile/content evidence. Seven DB/storage/service checks and one actual Nest/Fastify HTTP check pass (`worker-command-integration.log`, `worker-command-http-final.log`). Duplicate signed lease delivery admits one immutable attempt; cancellation denies subsequent signed renewal. Authenticated completion callbacks, immutable result receipts/checksum commits and reconciliation remain unfinished.

## Cancellation continuation — P
Six actual PostgreSQL lease/workflow checks pass (`validation/cancellation-api-integration.log`) after adding the API-owned cancellation service. Current actor/role/version checks precede one immutable redacted activity/outbox event, duplicate current-version requests return the same state, and renewals deny after cancellation. The run is not falsely marked cancelled before child-stop acknowledgement. Full authenticated callbacks and output commits remain unfinished.

## Actual scoped source handoff — 7 October 2026
P: `./test-runner-protocol.sh` passes the original real raster/private-preview/native-fact journey and the new current-actor/DB/S3-authorized runner journey (`authorized-runner-content-final.log`). The latter tests wrong fencing, actual modified stored bytes before submission, one execution receipt/attempt across retries and cancellation after input supersession during acknowledgement. Only the existing API bridges private infrastructure and processing networks; runner credentials are purpose-separated and configuration remains disabled by default. V: no committed runner artifacts/facts, callback idempotency, durable queue coordinator or complete task acceptance. No done status. See docs/adr/digitization-worker-commands.md.

## Private render continuation — 9 October 2026 (P)
Actual PDF/PNG outputs now commit immutable private artifacts under current source/grant/actor/lease/fence/revision checks. Sequential receipt replay succeeds. Revocation after transfer prevents DB commits; restoration recovers against the stored object. Concurrent replay recovery, generic callbacks and durable coordinator reconciliation remain unfinished.
`./test-runner-protocol.sh` passes five actual transport/authorized-runner journeys (`validation/render-commit-budget.log`). The adjacent host-locked workflow/lease/HTTP/input/scan/platform command passes 14 checks (`validation/run-render-integration-final.log`). Commands, retained failures and O/R/P/V: `../render-commits.md`. Task stays in_progress; no completed engine acceptance.
