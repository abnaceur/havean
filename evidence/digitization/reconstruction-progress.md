# COLMAP agent progress; gsplat integration remains unfinished

O: the user chose COLMAP + gsplat. The retained licensed reference-derived room clip is the existing CPU camera fixture in workspace `9acf2520-a922-4b23-830e-0a55aa0b97a6`; provenance is retained in `colmap-tum-xyz-fixture.json`. The previously published furnished example is manually authored, not a reconstructed capture.

R: preserve API ownership, actor/resource/version/source checks, private processing and independent publication reviews. Respect the user's GPU-validation deferral and paused VR. Camera calibration does not imply a trained visual scene, metric completeness or individually editable furniture meshes.

P: `reconstruction-status.ts` returns only the latest camera attempt in the current input and workspace version, validates current recipe/source authority, and restricts a successful report to that exact stage. The contract explicitly declares scene training unavailable. The agent panel polls active camera jobs without overlapping reads, restores status after navigation, suppresses a second submission while active and preserves unsaved privacy edits. Read failures clear old report data. The workflow links directly to capture preparation.

P: `reconstruction-progress-functional.log` records one actual desktop browser journey through the existing authenticated BFF/API/outbox/worker/COLMAP flow (1.1 minutes). It inspected and masked a frame, submitted one job, retained an unsaved mask input during polling, reloaded the page, and obtained 16 registered views with 3,354 sparse points and a private calibrated training archive. The initial cancelled attempt, when present, has no borrowed report. No API result or runner was mocked. Result run `0bc2511d-d94f-47ce-854c-411b87ea47e4`; report `1b4c6d29-37a5-4d13-89f2-5ee0f2107f62`.

Reproduction (retained local fixture only):

```sh
docker compose --profile tests run --rm --no-deps -e HAVEN_CAMERA_REVIEW_WORKSPACE=9acf2520-a922-4b23-830e-0a55aa0b97a6 tests pnpm exec playwright test tests/e2e/digitization-reconstruction-progress.spec.ts --project=desktop --output=test-results/reconstruction-progress
```

P: API and ops TypeScript checks, focused changed-file ESLint, generated contract checks and task-ledger validation pass. No broad suite or GPU validation was run.

V: full automatic reconstruction remains unavailable. Durable gsplat submission/execution and trained-output collection are not connected to the agent job flow. Required next implementation: scoped calibrated input binding, separately gated GPU execution, cancellation/lease/revision-fenced collection of private scene tiers, then independent privacy/render review before publication. The existing standalone wrapper and viewer do not prove this integration. Real GPU training and quality validation remain deferred. No task acceptance changed (root 120/120; engine 56/95), no published demo asset changed, no production/release claim.
