# HE-E09 — Accepted, 9 October 2026

R: exact acceptance “Render deterministic SVG/PNG”; minimum “Approved reference geometry matches expected topology/dimensions”. HE-E05 and HE-E07 prerequisites are accepted.

P: deterministic SVG/PNG validates canonical geometry, draws exact XY/right-handed topology, concave rooms and holes, explicitly confirmed opening spans, and interior labels. A separately confirmed synthetic metric reference preserves the known 10 m edge and 96 m² geometry room net area. Unknown heights remain unknown; unscaled/legacy geometry never acquires metre labels. Net areas are rendering diagnostics, never official deed/unit areas. Repeated multilingual PNG bytes match exactly on the declared pinned local renderer. DejaVu Sans 2.37 is unmodified, checksum-pinned and distributed with its full notice; SVG embeds both face and notice and has no remote font fetch. Native PNG requires the exact installed face. Source and compiled module layouts resolve bundled assets without depending on the API's working directory.

P: current agency/input/source/geometry checks surround private PNG rendering outside SQL, with two concurrent previews maximum and a 2048-pixel edge/30-megapixel input bound. Invalid floors and budgets fail closed. The saved editor exposes the selected floor's private PNG through its server session. This preview never approves geometry, creates a validated artifact or publishes a package.

Evidence: five renderer tests plus two inventory-contract tests pass in `evidence/digitization/plan-font-path-reference-final.log`. Full 135 units/43 files pass in `plan-preview-full-units.log`. The actual immutable-geometry/PNG/no-artifact/scope proof passes in `plan-private-preview-scope-final.log`. Two real checkpoint/cache integration checks and all 12 desktop/mobile editor/capture journeys pass in `plan-png-private-browser-font-path-fixed.log`, including actual PNG signatures/dimensions/repeated bytes/invalid budgets and floors. Nine workspace types, lint, 372 canonical operations and compiled API (no workspace source imports) pass; compiled font/notice resolution is checked in `plan-font-compiled-profile.log`.

Retained failures: `plan-fixed-font-unit.log` includes an incorrect root test package import, corrected with a repository-relative import; `plan-png-private-browser.log` retains the API-working-directory font failure (eight browser checks pass, four fail). `plan-inventory-final-integration.log` has 19 passes/one negative-test status mismatch: existing persisted-membership checks correctly returned 403 rather than the expected 404. Only the test expectation changed; the corrected private scope proof passes separately. No clean combined 20-test claim is made.

O: self-authored sources and synthetic reference geometry only. P: the reference's confirmation actor is a distinct synthetic fixture identity; it is not an actual human approval. V: no customer/property measurements, original-site parity, country holdout, production image security/font-runtime clearance, approved-output storage/public serializer or package/headset approval is asserted. Immutable artifact/export/publication integration remains with the downstream application/render/export tasks.

## Historical prework (not current acceptance)

## Acceptance
Deterministic SVG/PNG with correct topology/dimensions. In progress: editor, scale and revision prerequisites are unfinished.

## Implementation
API-owned `plan-render.ts` validates canonical geometry, selects an explicit floor, converts canonical Y to SVG display Y, renders concave polygons/holes and only explicitly confirmed opening spans, and places labels inside triangulated room interiors. XML labels are escaped, external references are absent, and unscaled/legacy geometry has no metre area labels. Scaled labels explicitly use geometry room net area; estimated scale is labeled. Sharp generates bounded PNG previews outside database work.

## Tests
Four renderer plus nine contract tests pass (13 total), as do API types, generated contracts and targeted lint (exit 0). Results are retained in `evidence/digitization/validation/plan-render.log`. Acceptance is not recorded as complete until prerequisites and integrated rendering pass.

## Limitations
Private utility, not an exposed public serializer or approved artifact. No source-image tracing, editor autosave, immutable derivative persistence, font embedding, structural GLB or package approval yet. Runtime system font selection remains to be inventoried before production rendering claims. No visual baseline changed.

## Next dependency
HE-E05/E07, actual processing/artifact integration, then HE-E10.

## O
No original property plans inspected.

## R
Canonical right-handed geometry, optional panoramas and independent approval.

## P
Synthetic rooms/holes/openings and actual PNG pixel tests; no measured property asserted.

## V
No independent geometry or visual approval.

## Exact verification commands

```sh
docker compose exec -T api pnpm exec vitest run tests/unit/digitization-plan-render.test.ts tests/unit/digitization-inventory-application-contract.test.ts
```

```sh
./test-runner-protocol.sh plan-editor
```

```sh
flock -n /tmp/haven-integration.lock docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests run --rm --no-deps -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration tests pnpm exec vitest run tests/integration/digitization-geometry-preview.test.ts
```
