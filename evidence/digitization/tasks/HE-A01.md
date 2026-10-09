# HE-A01 — Recheck repository and integration paths

## Acceptance
Checked HEAD equals the supplied inspected commit. Mandatory platform docs and existing integration paths were inspected; docs/digitization/repository-audit.md records actual paths and uncommitted management differences, SQL 106–107 reservation and environment observations. Root specification and 120-row ledger are preserved.

## Implementation
docs/digitization/repository-audit.md and docs/digitization/specification.md. The audit records the generic outbox acknowledgement gap, buffered legacy uploads, distinct content/publication approval, private evidence restrictions and legacy illustrative geometry.

## Tests
docker compose exec -T api pnpm task:validate
Passed on 6 October 2026: 120 marketplace tasks (88 done), 93 engine tasks (HE-R01 done at that check).

Confirmed actual regression files/assertions and command entry points by inspecting test.sh, ci.sh and scripts/ci-check.sh plus tests/integration/approved-tours.test.ts, tests/integration/outbox.test.ts, tests/e2e/rich-media.spec.ts and tests/e2e/spatial-tour.spec.ts. Exact isolated commands are retained in the repository audit; this task's minimum is command confirmation, not a claimed regression execution. git rev-parse HEAD returned 4c5b9f976f9df197ea65dafdbcd453bceda03f56; git diff -- TASKS.json TASKS.md SPECIFICATION.html returned no output.

## Limitations
The worktree has pre-existing, actively changing management implementation. Full clean startup/CI, reconstruction hardware/datasets, headset and country benchmarks are not established by the audit.

## Next dependency
HE-A02 architecture/licensing and CPU image; independent HE-R02/R05/R06 prerequisites.

## O
No new original-site reference capture.

## R
Supplied engine integration findings rechecked against repository sources at the exact inspected HEAD.

## P
Local checkout, Compose status and actual source/command inspection.

## V
Full engine release, new visual approval, original parity and production remain unverified.
