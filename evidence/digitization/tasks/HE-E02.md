# HE-E02 — Independent v2 topology and safe concave/hole triangulation

## Acceptance
Canonical v2 geometry supports rooms without panoramas, concave outlines and strictly contained holes. Topology validation rejects crossed/degenerate outlines and touching/outside/overlapping/nested holes. Validated triangulation preserves room net coordinate area and excludes holes. Legacy FloorLayout/MappedRoom schemas and playback fixtures remain unchanged.

## Implementation
packages/contracts/src/digitization-topology.ts, digitization-geometry.ts and index.ts; tests/unit/digitization-topology.test.ts; exact earcut 3.2.4 direct dependency (already resolved transitively) and existing ISC license record in docs/adr/dependencies.json. Generator updates originate from Zod, not hand-edited generated files. Optional engine-owned geometry metadata envelope cannot silently change legacy schema semantics; attachment authorization remains a future API task.

## Tests
docker compose exec -T api pnpm exec vitest run tests/unit/digitization-topology.test.ts tests/unit/digitization-contracts.test.ts tests/unit/legacy-digitization-geometry.test.ts tests/unit/spatial-media.test.ts
Passed 22 tests on 6 October 2026. Four topology cases verify L-shaped notch exclusion, actual courtyard triangulation under either winding, finite positive preserved net area, no hole-centroid triangles, invalid holes/crossed/degenerate outlines and API schema validation of no-panorama concave/hole models. Existing ten legacy schema/adapter/model checks remain passing without altered fixtures.

docker compose exec -T api pnpm contracts:generate
Passed operation/OpenAPI/runner schema generators.

docker compose exec -T api pnpm license:check
Passed 43 direct dependency records, 10 pinned images and 7 exact Python wheel locks; earcut package includes ISC LICENSE and shipped TypeScript types.

## Limitations
Output area is local coordinate area; unscaled px geometry remains unscaled and no official/measured area is inferred. Rendering adapters, GLB, source transform/scale distortion and geometry revision persistence/editor are later tasks. Legacy public model still uses its original convex renderer; new topology is not fed into that triangle fan. No metric measurements or review are auto-confirmed.

## Next dependency
HE-E03 source-overlay editor after HE-E01; HE-E09/E10 deterministic render/structural output.

## O
No new original reference capture.

## R
Supplied separate v2 and legacy compatibility contract; resolved earcut package source/license.

## P
Actual topology/schema/legacy tests with synthetic geometry; no surveyed property.

## V
New renderer, dimensions, visual parity, reconstruction and device acceptance remain unverified.
