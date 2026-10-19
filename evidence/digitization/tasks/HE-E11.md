## Acceptance
Add 3D plan/dollhouse viewer. Minimum: Select floor/room and verify matching 2D/3D room ID. Accepted after HE-E10.

## Implementation
Shared StructuralPlanViewer extends the existing operations plan editor through the server-session private GLB route. Three.js 0.186.1 is loaded only after an explicit Open 3D action. Bounded no-store fetch rejects external resources, unsupported profiles and a changed geometry revision before parsing. Floor visibility and room IDs synchronize with highlighted 2D polygons. Orbit, mouse/touch, keyboard pan/zoom/reset, selectable floor/room, cutaway wall hiding, retry and the existing 2D/download fallback are provided. Closing, replacing or losing the private view aborts transfer and disposes controls, geometry, materials and graphics context. Legacy normalized geometry and public-tour predicates are preserved.

## Tests
`structural-viewer-real-browser-installed.log`: two actual checkpoint/cache tests and all 14 desktop/mobile journeys pass, including real GLB load and matching 2D/3D room ID. The initial dependency-install failure is retained in `structural-viewer-real-browser.log`; refreshing the isolated integration dependency volume corrected setup.
`structural-viewer-cutaway-final-browser.log`: two desktop/mobile checks pass: actual software WebGL screenshot changes for keyboard zoom, Home reset, cutaway wall hiding/restoration and selected-room highlighting; room/floor IDs match; close/reopen disposes and recreates one canvas.
`structural-viewer-profile-tests.log`: two binary-profile checks pass. `structural-viewer-full-units.log`: 139 checks in 45 files pass. Final nine workspace type checks, lint/boundaries and pinned dependency/license gates pass. @types/three 0.186.0 is pinned with its unmodified MIT notice; the lock records its exact transitive resolution.

## O
 self-authored source and synthetic geometry; no measured customer property.

## R
 preserved supplied structural-viewer/common-room-ID specification and existing session boundaries.

## P
 actual local browser/loader/profile/type/license evidence above.

## V
 software Chromium WebGL and emulated mobile viewport only; no physical GPU/headset, device refresh measurement, human/parity, public package or production-runtime approval. Heights remain supplied-unverified and geometry review pending. Cutaway changes visibility only.

## Exact verification command
```sh
flock -n /tmp/haven-integration.lock docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests run --rm --no-deps tests pnpm exec playwright test tests/e2e/digitization-plan.spec.ts --project=desktop --project=mobile --grep HE-E11
```

## Limitations
Private draft structural visualization. No published package, measured-property or hardware acceptance.

## Next dependency
HE-I01 and HE-I05 follow their separate gallery/tour/reconstruction prerequisites.

## Construction workflow follow-up — 13 October 2026 (O/R/P/V)

See [construction rework](../construction-rework.md) for the dedicated studio, immutable metric corrections, wall visibility and captured-scene evidence. Focused functional evidence only; no new task acceptance or independent visual approval.
