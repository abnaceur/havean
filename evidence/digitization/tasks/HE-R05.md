# HE-R05 — Legacy geometry adapter and honest supplied dimensions

## Acceptance
One-way adapter preserves approved legacy layout/scene IDs and normalized shapes, converts axes explicitly into right-handed Z-up and back to the unchanged model convention. Supplied dimensions/heights remain unverified; authoring defaults remain illustrative. Existing panorama and plan-derived model playback remains readable.

## Implementation
packages/contracts/src/legacy-digitization-geometry.ts and index.ts; packages/ui/src/spatial-media-editor.tsx; apps/web/src/tour-model.tsx; tests/unit/legacy-digitization-geometry.test.ts. Legacy property-media schema, fixtures and golden files are unchanged. No inferred walls, openings, scale anchors or measured approval are added.

## Tests
docker compose exec -T api pnpm exec vitest run tests/unit/legacy-digitization-geometry.test.ts tests/unit/spatial-media.test.ts
Passed ten tests on 6 October 2026, including default/supplied provenance, immutable IDs/shapes, exact vertex inverse conversion, right-handed rotation and unchanged scene/convex schema requirements.

flock -n /tmp/haven-integration.lock docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests run --rm --no-deps tests pnpm exec playwright test tests/e2e/rich-media.spec.ts tests/e2e/spatial-tour.spec.ts --project=desktop --project=mobile
Stable detached fb59567 validation checkout plus engine changes: both spatial-tour projects and both listing rich-media projects passed actual upload/independent moderation, linked panorama/floor switching and supplied-dimension model controls. Entire command was 7 passed/1 failed because desktop development-media encountered a public BFF 503; that unrelated row is not counted as passing evidence. No new canonical measured geometry rendering is claimed.

## Limitations
Historical persisted 2.7 m cannot reliably distinguish an explicit supplied value from a serialized default; it remains unverified rather than retrospectively measured. This is compatibility only, not structural reconstruction, canonical polygon topology/holes or GLB. New screenshots are P only. Full CI's visual mismatches remain unresolved.

## Next dependency
HE-E02 canonical v2 topology/triangulation after HE-A03; HE-E03 manual authoring.

## O
No new original reference capture.

## R
Existing synthetic legacy layouts and their supplied/default authoring dimensions.

## P
Actual unit and desktop/mobile native browser playback, screenshots provisional.

## V
No visual parity, measurements, real reconstruction, GPU/WebXR or publication approval for new engine output.
