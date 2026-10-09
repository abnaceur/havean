# HE-A05-CPU — Bounded CPU service

## Acceptance
Existing dev.sh bootstraps exact hash-locked offline wheels and starts the existing services plus an isolated CPU runner. Pinned Python base, UID/GID 10001, read-only filesystem, dropped capabilities, no new host port, no database/queue/storage credentials, internal network, CPU/memory/process/scratch caps and real health probes are applied. API can reach readiness privately.

## Implementation
compose.digitization.yaml; dev.sh; services/property-processing/property_processing/server.py and tests/test_server.py; scripts/processing-licenses.mjs checks root processing overrides as well as service Dockerfiles/locks/models.

## Tests
`./dev.sh` exited 0 on 6 October 2026; retained development-start.log. API fetch of http://processing-cpu:8020/health/ready returned 200. Docker inspection verified user 10001:10001, readonly=true, memory=536870912, ports={}, processing network internal=true.
`docker run --rm $(docker image inspect haven-processing-tests-cpu --format '{{.Id}}')` passed 22 real CPU pytest tests, including real HTTP health/unknown routes/unavailable execution and production simulator refusal before binding. Retained cpu-server-tests.log.
`docker compose exec -T api pnpm exec vitest run tests/unit/processing-licenses.test.ts` passed 8 tests; root license gate passed 43 npm packages, 10 infrastructure services and 7 hash-locked Python packages.

## Limitations
CPU health does not claim OCR or reconstruction availability. Authenticated durable execution protocol follows HE-C03; GPU profile and parent HE-A05 remain unfinished. Native PDF/image inspection exists; no processing job is submitted by this task.

## O
No private document or measured capture.
## R
Supplied CPU/GPU resource boundaries and root implementation contract.
## P
Actual development startup, Docker policy inspection and real CPU container HTTP/pytest tests.
## V
No GPU/device/production or complete R1–R4 acceptance.

## Next dependency
Continue the next scoped engine task documented above; the full release is unfinished.

Additional verification: `./test-processing.sh` now reproduces the bounded CPU lane and passed 25 actual pytest tests (cpu-lane.log). `ci.sh` invokes it before the existing Node lane; neither lane mounts a Docker socket into a runner. Expanded PDF/image process-isolation acceptance remains tracked in HE-B04, not implicitly completed here.

## CPU raster continuation — P
The pinned CPU build now contains eight recorded Python packages. PDFium 156.0.8076.0 (pypdfium2 5.14.0) has 18 checksum-bound upstream license/notice files retained under docs/adr/licenses; native decoder version/flags/library checksum are verified at runtime. Nine licensing plus nine ledger tests and license:check pass (validation/raster-licenses.log). Actual raster/normalization/import-shadowing coverage passes 47 CPU checks (validation/raster-cpu.log). The rebuilt API and CPU service are healthy and scoped API-to-runner readiness returns 200 after restoring the configured processing network via the digitization Compose override (validation/raster-runtime.log). This does not enable OCR or complete B04 engine eligibility.
