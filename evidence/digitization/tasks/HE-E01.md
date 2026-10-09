## Acceptance
Select/deskew a plan page and preserve the overlay transform. Source pixel/editor geometry mapping survives rotation.

## Implementation
Read-only API selection of a committed scoped private source page, with bounded orientation/deskew matrices and inverse overlay coordinates. Details under P.

## Tests
`docker compose exec -T api pnpm exec vitest run tests/unit/digitization-plan-page.test.ts` — passed two checks.
`./test-runner-protocol.sh` — passed eight real journeys, including PNG/PDF page selection and source scope/revision denial.
Full `docker compose exec -T api pnpm test:unit` — 116 passed after relocating an isolated investigation Compose file outside the runtime licensing scan; the initial rejection remains recorded. Lint/types/353 contracts passed.

## Limitations
Canvas drawing/edit persistence and scale/height review are unfinished independent tasks. No customer benchmark, parity approval, scene or headset acceptance.

## Next dependency
HE-E03 plan canvas and its versioned geometry save/reload flow; independent OCR work continues with Abu Dhabi prioritized.

# HE-E01 — source page selection and deskew

## O
Authorized synthetic PNG/PDF sources only; no customer plan or human parity measurement. The existing real CPU runner rasterizes these sources into private checksum-bound artifacts.

## R
Select/deskew a plan page and preserve its overlay transform. Source pixels and editor geometry must map correctly after rotation. No scale or height may be inferred; preview access remains actor/target/source/revision scoped.

## P
The session API exposes one committed private page selection through `GET /api/v1/ops/digitizations/:id/artifacts/:artifactId/plan-page?clockwiseDegrees=90`. It checks active agency/workspace, succeeded raster stage, exact current revision, one checksum-fingerprinted source and stored private preview bytes; it rechecks scope/revision after storage retrieval. It returns original-pixel-to-editor and inverse matrices, source asset/page, workspace/input version and unscaled pixel extents. Orthogonal decoder orientation composes with bounded manual deskew and a canonical Y-up editor transform. Invalid/projective/sheared orientation and oversized extents fail closed. This is read-only selection; editing/persistence belongs to HE-E03 and later editor tasks.

## V
Passed: `evidence/digitization/plan-page-transform-unit.log` (two tests: independently expected quarter-turn/EXIF coordinates, negative/arbitrary rotations, inverse overlay mapping and invalid/budget rejection).
Passed: `evidence/digitization/plan-selection-runner.log` (eight actual Node/Python/PostgreSQL/S3/BullMQ journeys), including private PNG/PDF page selection, repeatable results, foreign organization denial and superseded revision denial.
Passed: `evidence/digitization/plan-selection-lint.log`, `plan-selection-types.log`, `plan-selection-contracts.log` (353 typed operations).
Actual development route without a server session returned 401 (direct API smoke check). Canvas controls, wall persistence, scale review and full engine/VR acceptance remain separate unfinished tasks.
