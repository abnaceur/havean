# HE-E05 — In progress

The v2 schema defines anchor endpoints in the revision's canonical XY coordinates/unit. Source-image endpoints must first use the recorded transform. Metric geometry requires a confirmed anchor, and every confirmed distance must agree with stored metre coordinates within numerical rounding tolerance (one part per million or 1e-8 m). Contradictory nonparallel dimensions reject; pending contradictory observations remain reviewable. This validation never silently stretches coordinates. Legacy supplied-unverified geometry is unchanged.

P: 21 contract/plan/GLB/legacy tests pass (`validation/scale-unit.log`), including conflicting horizontal/vertical dimensions and pending observations. Existing actual SVG tests hide metre area for unscaled traces, show the named estimated net area with valid evidence and preserve legacy limitations. R: supplied scale/conflict/legacy contract. O: synthetic authored coordinates only. V: no real property measurement, editor anchor controls, scale-calibration operation, persistence or complete HE-E05 acceptance. The minimum test's editor calibration remains unfinished; no done status.

Next: HE-E03 source-tracing editor, explicit uniform calibration with source-transform composition, versioned saves and reviewed anchor controls.

## Uniform calibration kernel — 7 October 2026
P: `plan-calibration.log` passes 12 actual calibration/render/GLB/legacy checks. API-owned `plan-scale.ts` converts an explicit unscaled single-floor trace using a selected known length, composes source-image affine transforms uniformly, preserves unknown heights and returns a new estimated pending revision without changing its parent. Conflicting second dimensions cannot become confirmed; unsupported vertical/multifloor conversion, singular transforms, repeat scaling and absent anchors reject. API types and targeted lint pass. O: synthetic 100-pixel/10-metre reference only. R: no invented scale/default height or silent stretch. V: no property measurement, authorized persistence/editor controls or complete HE-E05 acceptance; task stays in progress.

## Acceptance
Add scale anchors and metric-state gate. Unscaled plan hides metre area; known dimension yields expected scale.

## Implementation
The session-bound editor requires a saved trace, selected reference wall, positive supplied decimal metre length, source note and explicit observation confirmation. API calibration checks actor/agency, target, current input/processing authority, active workflow, exact version and immutable parent. It creates a new estimated metric revision, uniformly composes the source transform and scales room/wall/opening coordinates. Geometry review and vertical dimensions remain pending/unknown. Estimated metric editing is gated. Idempotent replay checks current source authority before retrieving its receipt; changed inputs cannot replay private geometry.

## Tests
`./test-runner-protocol.sh plan-editor` — six actual desktop/mobile journeys pass in `evidence/digitization/calibration-browser-final.log`. A genuinely scanned/private-rasterized authored source has no metre area before calibration. A supplied 12-metre reference for a 384-pixel wall yields coordinates (4,4)–(16,4), 1-metre door offset, 2-metre width and 96.00 square metres of estimated net geometry area. Reload preserves the metric revision and overlay. Replay creates no duplicate; negative distance rejects; removing the source binding invalidates the old replay with 409. No official property measurement is asserted.
`docker compose exec -T api pnpm exec vitest run tests/unit/digitization-plan-scale.test.ts tests/unit/digitization-plan-page.test.ts tests/unit/digitization-plan-render.test.ts` — eight checks pass in calibration-focused-unit.log, including unchanged unscaled parent, conflicting anchors, unsupported implicit vertical scale and repeat-calibration rejection. Full 120 units/38 files pass in calibration-unit-final.log. Nine workspace types, lint/boundaries and 359 canonical operations pass. The initial browser assertion expected 200 instead of the canonical POST 201; retained in calibration-browser.log and corrected without changing API behavior.

## Limitations
Only explicitly supplied reference lengths are accepted. No default or inferred metric scale, official inventory area, independent geometry approval, vertical registration, multi-floor calibration, country accuracy or device/parity claim.

## Next dependency
HE-E06 split/merge and multi-floor editing, HE-E07 revision conflicts/autosave, then HE-E09 deterministic rendering acceptance.

## O
Self-authored source pixels and synthetic 12-metre reference only.

## R
Supplied explicit-scale, immutable-revision, current-authority and metric-state requirements.

## P
Actual API/database persistence, isolated source processing and desktop/mobile session-bound editor journeys.

## V
Authorized Abu Dhabi records/measurements, independent geometry/parity approval and hardware/headset acceptance remain unverified.
