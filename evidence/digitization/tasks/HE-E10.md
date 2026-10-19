## Acceptance
Build structural mesh/GLB with openings and floor conversion. Accepted after HE-E09. Minimum test: Load GLB and inspect correct wall/door/floor geometry and axis orientation.

## Implementation and evidence (P)
Deterministic embedded GLB preserves concave rooms, holes and supplied confirmed door/window cuts. Canonical XYZ becomes glTF X/Z/-Y. Missing scale, height or sill blocks export. The private API rechecks current source/agency/geometry before and after bounded generation; it creates no artifact approval. Explicit dimension entry creates an immutable pending child with supplied-unverified provenance and preserves source coordinates. Empty values have no defaults.

`structural-dimensions-policy-loader.log`: four checks pass. Actual Khronos validation has zero errors/warnings; actual Three.js GLTFLoader and raycasts confirm wall solids and open door/window gaps. Independent binary volumes and axis/elevation checks pass. Repeated bytes match. `structural-dimensions-private-scope.log`: two actual database/private-preview checks pass, with no artifact/approval side effects.

`structural-dimensions-real-browser.log`: 13/14 desktop/mobile journeys pass; the mobile dimension test lacked canvas scrolling. The test-only correction passes in `structural-dimensions-mobile-scroll-fixed.log`. All 14 distinct journeys have positive evidence across these retained runs; no clean combined 14-pass claim. Actual empty fields, explicit entries, reload, private GLB bytes, replay and stale rejection are checked. Full units: 137/44; nine workspace types, lint/boundaries, 374 operations and compiled API (153 files, no workspace source imports) pass in the structural-dimensions logs.

## Reference labels
O: self-authored synthetic sources/geometry only; no customer property measurements.
R: preserved supplied specification; explicit scale/vertical data and the user's fixed-empty-field rule.
P: actual local loader, validator, raycast, database and browser evidence above.
V: no human/parity, photogrammetry, public artifact, production runtime, physical GPU/headset or device-performance approval. Slab thickness remains a declared illustrative assumption. Viewer/publication are downstream tasks.

## Exact verification command
```sh
docker compose exec -T api pnpm exec vitest run tests/unit/digitization-structural-glb.test.ts tests/unit/digitization-geometry-dimensions.test.ts
```

## Historical prework (not current acceptance)

## Acceptance
Structural mesh/GLB with approved opening geometry and explicit floor/axis conversion. In progress: scale/editor/render prerequisites, artifact storage and review delivery remain unfinished.

## Implementation
`structural-glb.ts` generates deterministic embedded glTF 2.0 binary floor slabs, concave rooms/holes and wall solids with supplied confirmed door/window cuts. Canonical X/Y/Z converts to glTF X/Z/-Y explicitly. Scale anchors are mandatory; missing wall/floor height or confirmed opening vertical dimensions blocks generation rather than guessing. Slab thickness is expressly an illustrative visualization assumption; height provenance and pending review remain encoded. Unconfirmed openings and non-geometric stair connections are declared rather than invented. Triangle/partition/Float32 precision budgets bound export work outside transactions.

## Tests
Two actual export checks pass in `validation/structural-glb-loader.log`: the pinned Khronos validator reports zero errors/warnings; Three.js GLTFLoader actually loads the emitted GLB with the same room ID. Independent binary signed-volume checks confirm the concave/hole slab and door/window void volumes, elevation and axis orientation. Repeated exports are byte-identical. Missing scale/height/sill and out-of-wall vertical dimensions reject. The first fixture used an invalid decimal `.2`; corrected to canonical `0.2`, with failure retained. An intermediate Float32 tuple cast failed typechecking and was corrected; corrected types/lint are retained.

## Limitations
This is structural plan geometry, not photogrammetry/CAD or an approved public artifact. No editor/public viewer/device acceptance or stored reviewed GLB yet. Export requires metric anchors; legacy/unscaled playback remains in the existing adapter and is never retrospectively measured. Arbitrary architecture, stairs and missing vertical opening data are not synthesized.

## Next dependency
HE-E05/E07/E09 full authoring/render delivery, HE-E11 actual browser viewer and HE-J artifact publication.

## O
No measured customer property.

## R
Supplied geometry truth/scale/opening rules and official glTF/Three.js format documentation.

## P
Authored synthetic geometry, actual Khronos validation and actual Three.js loader inspection.

## V
No property measurement, device performance, visual approval or independent publication.

## Construction workflow follow-up — 13 October 2026 (O/R/P/V)

See [construction rework](../construction-rework.md) for the dedicated studio, immutable metric corrections, wall visibility and captured-scene evidence. Focused functional evidence only; no new task acceptance or independent visual approval.
