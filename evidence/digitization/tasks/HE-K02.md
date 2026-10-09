## Acceptance
Add quota/resource controls and cleanup policies. Over-budget job blocked; expired multipart and scratch objects reclaimed.

## Implementation
Existing server-owned run clocks and per-run/agency seconds/scratch/count reservations prevent over-budget dispatch and bind execution/renewal/cancellation deadlines. SQL185 adds service-only expired-capture cleanup capabilities with immutable capture identity, current version, workflow and expiry checks. Claims select only expired provisioning/uploading/cancellation reservations; live and completed uploads remain retained. Durable cleanup jobs lease a monotonically increasing fence. The signed internal API aborts the exact database-owned multipart upload, confirms its absence, deletes an orphan capture object and confirms its absence before marking cleanup complete. Failures retain retryable jobs; stale lease/fence completion cannot succeed. Ordinary actors cannot read cleanup keys or claim jobs. Responses expose only a count. A separate worker timer invokes maintenance without blocking outbox dispatch.
CPU runner sweeps bounded stopped terminal scratch after a one-day deadline/update recovery window. Active decoders, pending work, symlinks and interrupted/ambiguous processes are retained. Expired unreceived sources become terminal before later cleanup. Only validated execution UUID directories under the private root are deleted with symlink-resistant rmtree. Durable SQLite receipts remain, so old execution IDs cannot restart after byte cleanup. The additive local-store column migration retains old receipts and explicit insert columns.

## Tests
`flock -n /tmp/haven-integration.lock docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration api pnpm exec vitest run tests/integration/digitization-resource-budgets.test.ts tests/integration/digitization-cleanup.test.ts tests/integration/digitization-capture.test.ts tests/integration/digitization-access.test.ts tests/integration/digitization-intakes.test.ts tests/integration/digitization-schema.test.ts` — cleanup-quota-scope-final.log: 20 actual PostgreSQL/storage tests pass. Per-run and aggregate seconds/scratch/count over-budget attempts reject. Cleanup removes a real expired multipart segment and orphan object after a genuine refused-connection storage outage. Pending jobs survive; controlled fixture lease expiry increments its fence on retry, and stale completion rejects. Actual ListParts/HeadObject confirm absence; a live sibling reservation remains. Ordinary actor SQL/unsigned maintenance reject. Resource-slot race uses synthetic reservation metadata only, with no physical GPU claim.
`docker compose -f services/property-processing/compose.tests.yaml build --builder default cpu` and `docker compose -f services/property-processing/compose.tests.yaml run --rm cpu` — cleanup-cpu-build.log and cleanup-cpu-tests-final.log: 72 CPU checks pass. Three cleanup tests verify real directory removal and retained receipts, active/fresh/pending/interrupted retention, execution symlink refusal and terminal expiry of unreceived sources. Controlled clocks test the policy; these are not measured one-day throughput/latency claims. The initial unsupported CLI flag is retained in cleanup-cpu-tests.log.
`./test-runner-protocol.sh` — cleanup-runner-regression.log: all eight actual API/CPU/queue/database/storage/private derivative journeys pass with the updated local-store schema and maintenance loop, including actual process cancellation, fencing/recovery and raster over-budget refusal.
Full 125 units/40 files, nine workspace types, lint/import boundaries, compiled native worker, baseline license gate and 370 canonical operations pass in cleanup-unit.log, cleanup-types-final.log, cleanup-lint-final.log, cleanup-worker-build.log, cleanup-license-check.log and cleanup-contracts-check.log. SQL185 applies to development/integration.

## Limitations
Scratch receipts remain for fencing/replay. Ambiguous interrupted work is quarantined for trusted reconciliation; timeout alone does not assert process closure or reclaim GPU resources. This does not delete approved artifacts/packages or records, implement viewer GPU disposal, enable models or supply a production storage-retention benchmark. Failed storage cleanup retries rather than asserting removal.

## Next dependency
HE-R07 reviewed inventory application, HE-F01 media probe and independent OCR/GPU/reconstruction prerequisites.

## O
Self-authored quarantined storage bytes, controlled fixture clocks and synthetic resource-slot metadata only.

## R
Supplied quota/resource limits, confirmed termination, private ownership and durable expiry/cleanup acceptance.

## P
Actual bounded CPU scratch deletion, retained SQLite receipts, PostgreSQL fences, real S3 absence checks/outage recovery and live runner regressions.

## V
No GPU process closure, country accuracy, viewer/headset measurement, human/parity approval or production completion.
