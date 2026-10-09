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
