## Acceptance
Scan and raster-budget isolation. Verified for the supplied first-slice small private document/image scope.

## Implementation
Every small source bind and execution transfer rescans actual bounded stored bytes through ClamAV. The pinned PDF/image decoder runs under mandatory Landlock/seccomp and bounded raster/byte/time/process budgets.

## Tests
`flock -n /tmp/haven-integration.lock docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests run --rm --no-deps tests pnpm exec vitest run tests/integration/digitization-revision-authority.test.ts tests/integration/digitization-source-validation.test.ts tests/integration/digitization-workflow.test.ts tests/integration/digitization-schema.test.ts tests/integration/digitization-inputs.test.ts tests/integration/digitization-intakes.test.ts tests/integration/digitization-leases.test.ts tests/integration/outbox.test.ts` — passed.
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

# HE-B04 — In progress: source decoder isolation

## Acceptance
Real malware rejection and bounded isolated source decoding are required before engine processing.
## Implementation
Existing scanFile/ClamAV remains authoritative. New property_processing/source_sandbox.py and source_cli.py supervise an allowlisted Python child process with bounded CPU/address-space/output/diagnostics/deadline, process-group termination, no inherited service credentials, fixed command arguments, safe rooted regular files and sanitized failure codes. Native PDF inspection checks encryption/page/expanded raster budgets; images use real upright bounded decoding. No native text rectangles are invented and scanned pages still require OCR.
## Tests
`docker build --builder default -f services/property-processing/Dockerfile.cpu --target cpu-tests -t haven-processing-tests-cpu .`
`docker run --rm $(docker image inspect haven-processing-tests-cpu --format '{{.Id}}')`
Passed 25 actual CPU pytest checks on 6 October 2026; source-sandbox-tests.log retained. Three new sandbox cases execute a real child, preserve native text, reject an oversized raster footprint, terminate on deadline/output budget and deny escaping/symlink/unknown stage paths.
`flock -n /tmp/haven-integration.lock docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests run --rm --no-deps tests pnpm exec vitest run tests/integration/digitization-source-scan.test.ts tests/integration/digitization-source-validation.test.ts`
Passed two real source/ClamAV checks; source-scan.log retained. Actual antivirus test bytes receive UNSAFE_FILE while a clean source is accepted. The fixture is not a customer document.
## Limitations
Task remains in_progress. Durable quarantine/processing eligibility integration follows HE-B03 and the authenticated typed runner protocol; source inspection is not yet invoked through a Haven engine run. Actual bounded PDFium raster page output is now implemented/tested; PaddleOCR and country benchmarks remain unfinished. Large video scanner policy/throughput is not verified. These tests do not prove the whole upload path is ready.
## Next dependency
Connect isolated source preflight to authoritative quarantine/input revisions and durable jobs, then add real raster/OCR stages.
## O
No original document.
## R
Supplied unsafe parser/scan/resource budget requirements.
## P
Actual unprivileged CPU child process limits and real ClamAV rejection fixtures.
## V
No completed engine scan/decoder pipeline, source crop, OCR or reconstruction acceptance.

## CPU raster continuation — P
The pinned CPU build now contains eight recorded Python packages. PDFium 156.0.8076.0 (pypdfium2 5.14.0) has 18 checksum-bound upstream license/notice files retained under docs/adr/licenses; native decoder version/flags/library checksum are verified at runtime. Nine licensing plus nine ledger tests and license:check pass (validation/raster-licenses.log). Actual raster/normalization/import-shadowing coverage passes 47 CPU checks (validation/raster-cpu.log). The rebuilt API and CPU service are healthy and scoped API-to-runner readiness returns 200 after restoring the configured processing network via the digitization Compose override (validation/raster-runtime.log). This does not enable OCR or complete B04 engine eligibility.

## Mandatory decoder confinement — P
`validation/decoder-isolation-final.log`: 65 pytest checks pass in the unprivileged CPU Compose lane. Before any uploaded file is parsed, the child applies Landlock ABI >=6 and seccomp with no unsafe fallback: only its job directory is writable, runtime libraries/fonts/code are readable, other jobs/signing keys/proc are inaccessible, networking and child process creation are denied. Real kernel denial tests exercise these boundaries. The signing key must live outside decoder-readable roots; the HTTP parent and supervisor retain separately scoped functions. This profile is for PDF/image decoding only; future OCR/video/GPU profiles require their own compatibility/isolation tests.

## Private render continuation — 9 October 2026 (P)
Actual PNG/PDF render sources pass ClamAV before scanned fixture creation. A real oversized PDF terminates with RASTER_BUDGET_EXCEEDED, creates no artifact and leaves its dependent stage pending. Valid isolated render results now commit privately. Large capture scan/eligibility remains unfinished.
`./test-runner-protocol.sh` passes five actual transport/authorized-runner journeys (`validation/render-commit-budget.log`). The adjacent host-locked workflow/lease/HTTP/input/scan/platform command passes 14 checks (`validation/run-render-integration-final.log`). Commands, retained failures and O/R/P/V: `../render-commits.md`. Task stays in_progress; no completed engine acceptance.
