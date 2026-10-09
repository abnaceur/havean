## Acceptance
Implement run/stage dependency graph and legal transitions. Verified for the supplied first-slice small private document/image scope.

## Implementation
API-owned graph creation and dispatch persist an acyclic sealed dependency graph, atomically queue eligible roots and retain immutable source revision/fingerprint. SQL validates every legal run/stage transition, actor scope, version, source authority, deadline, dependency and execution fence. Private completion queues newly eligible dependent stages.

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
Persist an acyclic run/stage dependency graph and reject invalid transitions or unsatisfied dependencies. In progress: HE-B05 source snapshot integration is unfinished; no processing API execution is exposed by this slice.

## Implementation
`144-digitization-stage-workflow.sql` serializes graph edits against the parent run, rejects cycles/sealed edits, validates run/stage transition legality, requires success of compulsory dependencies, bounded fresh execution leases and immutable execution identities, and rejects late success after cancellation or expiry. `apps/api/src/inventory/digitization/workflow.ts` validates a server-prepared graph, actor/target/unit scope, source/workspace versions and bounded deadlines before persisting draft stages/dependencies and redacted events in one actor transaction. Publication remains separate and unavailable.

## Tests
`./test.sh pnpm exec vitest run tests/integration/digitization-workflow.test.ts tests/integration/digitization-schema.test.ts` passed 11 tests against a freshly reset isolated stack (exit 0). Its log is `evidence/digitization/validation/workflow.log`; The real database suite verifies cycle/sealed-graph rejection, unsatisfied/skipped dependencies, bounded and expired leases, new execution fences, cancellation, actor/version/revision checks and existing RLS regressions.
`docker compose exec -T api pnpm exec vitest run tests/unit/digitization-contracts.test.ts` passed 9 contract tests. API type/contract and targeted lint checks pass in the final plan-render checks log.

## Limitations
No dedicated queue dispatch, runner protocol, stage completion API, artifact commits, resource quotas, retry caps or processing run endpoint yet. Database transition checks do not grant any worker publication or evidence capability. The graph snapshot service accepts server-prepared stages; the C03 profile registry must guard execution configuration.

## Next dependency
HE-B05, HE-R06/C02–C04 and real OCR pipeline.

## O
No customer sources inspected.

## R
Durable dependencies, fencing and separate publication requirements.

## P
Synthetic contract fixtures and passing real PostgreSQL checks.

## V
No end-to-end processing or independent package approval.

## Private render continuation — 9 October 2026 (P)
API-owned dispatch seals the current creator-authorized graph, rechecks source grants/revision/version/deadline, queues roots and writes one redacted outbox event atomically. Successful guarded render commits queue eligible dependencies exactly once. HE-B05 prerequisites and complete processing integration remain unfinished.
`./test-runner-protocol.sh` passes five actual transport/authorized-runner journeys (`validation/render-commit-budget.log`). The adjacent host-locked workflow/lease/HTTP/input/scan/platform command passes 14 checks (`validation/run-render-integration-final.log`). Commands, retained failures and O/R/P/V: `../render-commits.md`. Task stays in_progress; no completed engine acceptance.
