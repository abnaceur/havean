## Acceptance
Add budget/quota and GPU resource leases. Two heavy jobs cannot acquire the same exclusive GPU lease.

## Implementation
Run creation/dispatch reserve bounded seconds/scratch and at most four active runs per agency through a narrow globally serialized database capability, including private intake reservations invisible to other actors. First lease starts a server-owned immutable clock; execution, renewal and cancellation use the same budget-bound deadline. Internal signed-service ports acquire/renew/release compatible registered exclusive resource slots with execution/stage/global fencing. Resources are not registered or enabled by ordinary actors. One stage holds at most one slot; replay returns its existing lease. Expiry quarantines a slot, and retry cannot replace an execution while its prior resource remains held. Release requires a succeeded/cancelled terminal closure; a failed state or timeout does not assert process termination. No slot/device is registered by default.

## Tests
`flock -n /tmp/haven-integration.lock docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration api pnpm exec vitest run tests/integration/digitization-resource-budgets.test.ts` — two actual PostgreSQL tests pass in `resource-budgets-final-integration.log`. Two synthetic heavy-stage reservations race a single compatible test slot: exactly one succeeds and the other receives 409. Replay/renewal reuse its fence; stale renewal and active release reject; expiry does not free it. Explicit terminal cancellation of an unstarted synthetic reservation permits release/reassignment with an incremented fence. Ordinary actor SQL cannot read the registry. Per-run, aggregate seconds/scratch and active-count limits reject with 422/429. The synthetic slot is deleted after the test; no GPU device or training process is asserted.
`./test-runner-protocol.sh` — all eight actual CPU/queue/database/storage/private derivative regression journeys pass in resource-budgets-runner-fixed.log, including real process cancellation after source change, expired-fence recovery and over-budget raster rejection. Initial cancellation deadline mismatch and retained fixture reservations are preserved in resource-budgets-runner-regression.log; metadata now shares the immutable execution deadline and synthetic queued fixtures perform confirmed cleanup.
Full 123 units/39 files, nine workspace types, lint/import boundaries and 365 canonical operations pass. SQL175–180 applies to development/integration. Dependency-resolution failure in resource-budgets-integration.log is retained; using the existing pinned API dependency resolves the test import without adding packages.

## Limitations
Reservation/concurrency behavior is tested with synthetic resource metadata; CUDA hardware, trained reconstruction, actual GPU termination and node-loss reconciliation require the independent GPU/runner gates. Expired GPU slots remain quarantined until verified closure or trusted host intervention. No real GPU is enabled, no model is distributed and reconstruction capability remains unavailable.

## Next dependency
HE-C10 revision reuse/invalidation and the independent GPU/reconstruction host/adapter tasks.

## O
Self-authored private source and synthetic resource-registration metadata only; no physical GPU workload.

## R
Supplied actor/source/version/state checks, bounded quotas, one heavy job per GPU and confirmed termination/fencing requirements.

## P
Actual database locks, quota reservations, signed-service ports and real CPU/queue/process regression evidence.

## V
GPU hardware/model/runtime, scene quality, authorized Abu Dhabi holdout, parity and headset acceptance remain unverified.
