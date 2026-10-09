# HE-A03 — Versioned engine contracts

## Acceptance
Versioned strict fact, geometry, run/stage graph and public scene manifest schemas reject invalid coordinates, unsupported units, missing source evidence, conflicting graph revisions and unsupported splat encoding. Unknown facts remain null; decimal quantities and identifiers remain strings. Independent geometry does not require panorama links or invent default heights.

## Implementation
packages/contracts/src/digitization.ts, digitization-geometry.ts and index.ts; packages/contracts/src/openapi.ts; scripts/generate-digitization-schemas.ts; package.json contract generation/check entry points; generated OpenAPI and services/property-processing/schemas/digitization.schema.json; tests/unit/digitization-contracts.test.ts.

## Tests
docker compose exec -T api pnpm exec vitest run tests/unit/digitization-contracts.test.ts
Passed eight meaningful validation cases on 6 October 2026, including missing evidence, invalid ordered boxes, unsupported units, numeric identifiers, invalid wall/opening references, graph cycles, stale fencing/revisions, invented progress denominators, private public-manifest fields and incompatible PLY encoding.

docker compose exec -T api pnpm contracts:generate
Passed actual generators; public components and Python transport schemas derive from Zod.

docker compose exec -T api pnpm contracts:check
Passed operation, OpenAPI and digitization transport generator checks.

docker compose exec -T api pnpm typecheck
Passed all nine workspace projects.

## Limitations
These are validation contracts, not implemented routes, runner authority or publication. Generated JSON Schema describes transport shapes; API refinements remain authoritative for cross-reference/topology/grant checks. Polygon topology/triangulation, source transformation determinant and scale distortion checks are subsequent HE-E02/E05 work. No OCR or reconstruction is represented as available.

## Next dependency
HE-R02 shared access and HE-A04 scoped additive migrations; HE-A06 adapter policy.

## O
No original reference capture.

## R
Supplied versioned evidence/geometry/state/manifest requirements and unchanged legacy property-media schemas.

## P
Actual schema tests, generators and workspace type check; synthetic validation fixtures.

## V
Real processing, application/device acceptance and publication remain unverified.
