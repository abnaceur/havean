## Acceptance
Build authenticated runner protocol and typed stage registry. Verified for the supplied first-slice small private document/image scope.

## Implementation
Authenticated bounded runner transport and typed allowlisted execution registry reject arbitrary stages, profiles, paths, commands and resources. API verifies immutable scoped source bytes before transfer. Separate runner/coordinator/session keys prevent capability substitution; unknown or unavailable advanced profiles cannot produce accepted outputs. Duplicate execution identity reuses its durable runner receipt.

## Tests
`flock -n /tmp/haven-integration.lock docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests run --rm --no-deps tests pnpm exec vitest run tests/integration/viewing-reminders.test.ts tests/integration/digitization-outbox-routing.test.ts tests/integration/digitization-worker-http.test.ts tests/integration/digitization-source-scan.test.ts` — passed.
`./test-processing.sh` — passed.
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
Typed authenticated runner protocol with duplicate execution reuse and allowlisted stages/profiles. In progress: API/coordinator job-scoped artifact delivery and credential configuration are not yet wired.

## Implementation
Canonical Zod `DigitizationExecutionRequest` and generated runner schema contain execution/org/run/stage/revision/fence IDs, content fingerprints, immutable artifact references and bounded budgets. Python `executions.py` validates a two-profile real CPU decoder registry; HTTP accepts no filenames, object keys or commands. Short-lived HMAC grants bind a request digest, execution and explicit actions. SQLite records the runner's execution receipt before returning 202; PostgreSQL remains the authoritative workflow/review state. Pending receipts survive restart; interrupted running work reports RUNNER_INTERRUPTED rather than blindly relaunching. HTTP execution routes remain disabled by default until both private signing key and durable execution root are explicitly configured.

## Tests
`./test-processing.sh` initial execution invocation passed 52 checks (`validation/execution-cpu.log`), including real isolated PDF raster execution, persisted duplicate receipt reuse, changed-body 409, checksum mismatch, unknown profiles/commands/budgets, token expiry/action/scope denial, restart and cancellation. The first run had an incorrect relative test import; corrected and retained at execution-cpu-initial.log. Final cancellation-race and actual child-termination checks are recorded separately in execution-cpu-final.log. Canonical contracts regenerated via existing generators; contracts:check passes.

## Limitations
Authenticated source transfer and checksum-bound private preview retrieval are implemented at the transport layer; selection from a currently authorized Haven run remains unfinished. No outbox/BullMQ engine consumer, coordinator callback or guarded artifact commit yet. Execution cannot be used as a publication grant. No OCR/reconstruction profile is enabled. Inputs are authored fixtures, not proof of full Haven run orchestration. No new public endpoint, shared queue or session store added. API cancellation/fencing services exist but coordinator/process acknowledgement is not yet wired.

## Next dependency
HE-C01/C02/C04 and private job-scoped artifact source port, then HE-D02.

## Private preview continuation — P
`./test-processing.sh` passes 66 checks in 10.04 seconds (`validation/private-preview-cpu-final.log`). `./test-runner-protocol.sh` passes the real API Node → isolated Python execution and output-transfer journey (`validation/private-preview-protocol.log`). Preview grants are a separate action scoped to the execution and request digest; status/source grants cannot download previews. The runner selects only succeeded receipt outputs by checksum, validates fixed private filenames, regular-file/no-symlink access, <=32 MiB PNG bytes and their actual SHA-256. The API transport independently bounds/rechecks received bytes and checksum. Cross-request/key, source-file requests, tampered bytes and symlink substitution deny. Bare filenames remain 404. No browser/provider path or public publication grant is introduced. These internal transfers still require guarded run/source selection and durable artifact commits before an agent review flow is complete.

## O
No customer documents accessed.

## Current Haven scope and command boundary — P, 7 October
`execution-scope.ts` prepares requests only from current API-owned run leases and immutable sources with matching content/profile/scope fingerprint and explicit current document-processing authority. It caps execution budgets, denies ambiguous selection and returns no object key. Superseding the input revision invalidates request preparation while preserving old snapshots/runs.

Seven actual DB/storage/command checks pass (`validation/worker-command-integration.log`), including wrong fence, unknown asset, duplicate lease and superseded input denial. A separate real Nest/Fastify process passes one authenticated HTTP acceptance (`validation/worker-command-http-final.log`): wrong service key 401, supplied admin roles 422, duplicate lease 409, missing source 404 and cancelled renewal 409. Current initiating roles are read from PostgreSQL on every request. One crypto boundary test passes; canonical generation/check reports 337 operations, and API/config types plus targeted lint pass. Initial missing canonical response mappings and HTTP decorator-tsconfig failures were corrected and retained. `docs/adr/digitization-worker-commands.md` records policy and remaining credential/queue/source/commit integration. No C03 done status or full Haven-run processing claimed.

## R
Supplied durable runner execution and least-authority requirements.

## P
Actual private HTTP/subprocess/SQLite execution tests and generated transport schemas.

## V
No full engine, independent publication, OCR/model or GPU acceptance.

## Real source transport continuation — P
The configured runner now waits for an authenticated immutable source upload, verifies MIME/length/hash, fsyncs its bounded private file and only then makes execution runnable. Interrupted partial uploads recover the same receipt; rename-before-receipt crashes recover verified inputs. Fifty-eight CPU tests pass (execution-source-recovery.log), plus the separately named `./test-runner-protocol.sh` real Node API-client → isolated Python runner test (runner-protocol-command.log). It passes scoped source transfer, actual rasterization, duplicate reuse, wrong-key/altered-org rejection and no public preview path. The ordinary DB CI skips that explicitly configured transport test; no skipped test is counted as acceptance. The named wrapper uses an immutable locally built image ID, unprivileged read-only container, private processing network, bounded tmpfs and no host port or infrastructure credentials. Its synthetic public test credential is destroyed on exit. Source preparation is now HTTP transfer rather than pre-copied files in this test. Haven run/lease/grant-to-source selection and callback/commit remain unwired, so C03 remains in progress.

## Actual scoped source handoff — 7 October 2026
P: `./test-runner-protocol.sh` passes the original real raster/private-preview/native-fact journey and the new current-actor/DB/S3-authorized runner journey (`authorized-runner-content-final.log`). The latter tests wrong fencing, actual modified stored bytes before submission, one execution receipt/attempt across retries and cancellation after input supersession during acknowledgement. Only the existing API bridges private infrastructure and processing networks; runner credentials are purpose-separated and configuration remains disabled by default. V: no committed runner artifacts/facts, callback idempotency, durable queue coordinator or complete task acceptance. No done status. See docs/adr/digitization-worker-commands.md.

## Private render continuation — 9 October 2026 (P)
Two additional authenticated worker commands expose dispatch and validated private render collection. Contracts and OpenAPI describe 346 operations and the separate coordinator HMAC/timestamp. Full profiles/coordinator/output types remain unfinished.
`./test-runner-protocol.sh` passes five actual transport/authorized-runner journeys (`validation/render-commit-budget.log`). The adjacent host-locked workflow/lease/HTTP/input/scan/platform command passes 14 checks (`validation/run-render-integration-final.log`). Commands, retained failures and O/R/P/V: `../render-commits.md`. Task stays in_progress; no completed engine acceptance.
