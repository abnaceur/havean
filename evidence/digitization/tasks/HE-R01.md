# HE-R01 — Separate engine ledger and combined release gate

## Acceptance
The engine backlog contains all 93 supplied HE rows with their prerequisites and minimum tests. Root TASKS.json retains its 120 marketplace rows. Root task:validate/check:release invoke both validators; unfinished engine work blocks release independently of platform work.

## Implementation
- docs/digitization/specification.md, TASKS.json, generated TASKS.md, tasks.schema.json
- scripts/digitization-tasks.mjs and scripts/lib/digitization-tasks.mjs
- scripts/tasks.mjs (additive combined gate)
- tests/unit/digitization-ledger.test.ts
Schema validation fails unknown fields/unsupported schema keywords. Graph validation rejects missing baseline tasks, duplicates, unknown dependencies and cycles. Done tasks require completed prerequisites, a passing record for every minimum test, task-specific evidence within checkout, exact command text, and nonempty acceptance/implementation/test/limitation/next-dependency/O/R/P/V sections. Markdown drift is rejected; --write is explicit.

## Tests
docker compose exec -T api pnpm exec vitest run tests/unit/digitization-ledger.test.ts
Passed 9 tests on 6 October 2026. They exercise actual CLI subprocesses, combined root validation/release, missing evidence, missing passing tests, missing provenance, cycles, unknown dependencies, duplicate/removal, empty contracts, stale markdown and out-of-checkout symlink evidence. Tests preserve original marketplace ledger bytes. Combined release fixture fails on both Q11 and HE-K08 while ordinary fixture validation accepts all 120 original rows.

## Limitations
This is an implementation/evidence gate, not proof of future OCR/reconstruction acceptance. Done evidence claims still require truthful review and actual recorded execution. Full engine and platform release remain unfinished. The saved specification is a repository-oriented transcription of the supplied prose with preserved atomic task rows.

## Next dependency
HE-A01 repository audit; HE-R02/R05/R06 prerequisite implementations.

## O
No original-site capture or new parity claim.

## R
User-supplied engine sections 0.2, 15 and 16; existing root implementation contract and 120-task validator inspected at 4c5b9f976f9df197ea65dafdbcd453bceda03f56.

## P
Local Docker Compose execution and synthetic temporary ledger fixtures; no invented processing output or measurements.

## V
Original-site parity, new visual approval, production deployment and full R1–R4 acceptance remain unverified.
