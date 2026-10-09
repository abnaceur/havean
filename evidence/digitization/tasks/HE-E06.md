## Acceptance
Add split/merge and multi-floor editing. Split preserves valid polygons; stair connects selected floor IDs.

## Implementation
API-owned operations split a room along an explicitly selected vertex diagonal, merge rooms sharing one complete edge, add named unregistered floors and connect two explicitly selected floor IDs. Shared topology validation and independent area conservation reject invalid/crossing/outside diagonals, ambiguous merges, holes requiring retracing and invalid/duplicate floor links. All resulting geometry uses the current actor/source/input/version/state-checked immutable save port. Room provenance survives; unsupported associations are not guessed. The editor filters geometry by active floor and draws new boundaries onto the selected floor. Zero unscaled floor elevation is a schema placeholder, explicitly displayed as unknown relative placement; no metric vertical registration or height is inferred.

## Tests
`./test-runner-protocol.sh plan-editor` — eight desktop/mobile source/editor journeys pass in `evidence/digitization/plan-edit-browser.log`. Two new actual journeys draw a private scanned/rasterized source room, split into valid triangles, merge back into the original four-vertex boundary, add an upper floor, connect its exact ID to the selected ground ID and reload identical persisted geometry. Switching floors changes visible geometry; heights/review remain unknown/pending. Existing wall/opening/calibration/private SVG/replay tests still pass.
`docker compose exec -T api pnpm exec vitest run tests/unit/digitization-plan-edit.test.ts` — three tests pass in plan-edit-unit.log. Expected 96-pixel-square room becomes 48+48 and merges back to 96 without mutating its parent. Concave outside diagonals, hole dropping, same/missing floors and duplicate reversed stair connections reject. Nine workspace types, full lint/boundaries and 360 canonical operations pass. Initial missing operation-response mapping failure is retained in plan-edit-contracts.log and resolved by registering the canonical response.

## Limitations
Simple vertex-diagonal splits and single shared-edge merges only; complex/holed boundaries require explicit tracing. Floors remain unregistered and use the selected source page; no evidence-backed relative height, automatic alignment, multi-floor calibration, official area, panorama link reassignment, parity or physical device approval is asserted.

## Next dependency
HE-E07 undo/redo, private autosave and concurrent revision conflict preservation.

## O
Self-authored source pixels and synthetic polygon topology only.

## R
Supplied API-owned business rules, valid polygons, explicit stairs/floors, source provenance and immutable mutation checks.

## P
Actual browser mouse/touch, scoped API/database saves and real isolated private source rendering.

## V
Authorized Abu Dhabi property measurements, vertical registration, human parity, reconstruction and headset gates remain unverified.
