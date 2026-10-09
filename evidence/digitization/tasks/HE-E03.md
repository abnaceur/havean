## Acceptance
Build a plan canvas with source overlay and walls. Draw/move a wall then reload must retain geometry.

## Implementation
A private session-bound editor at `/ops/digitization?workspace=...` selects committed current-source pages, controls opacity/deskew/zoom/pan/grid snapping, and draws/moves/deletes unscaled walls. Unknown heights and review-pending status are preserved. The API saves immutable children with actor/target/source/parent/workspace-version/state checks and no publication. SQL173 binds new geometry snapshots to an exact input revision/private rendered artifact; legacy rows retain their original interpretation. Geometry parents are read without UPDATE locks because snapshots are immutable; the workspace lock serializes competing saves. Source transforms cannot be forged through the trace save, and scale/review/height escalation is refused. Canonical listing workspace responses now include the required target unit ID.

## Tests
`./test-runner-protocol.sh plan-editor` — passed two actual desktop/mobile browser journeys (`evidence/digitization/geometry-editor-browser.log`); each source was genuinely scanned, bound, rasterized by the isolated CPU and privately committed before testing. Desktop uses native mouse input; mobile uses browser touch events. Draw, save, move, reload, opacity/zoom/pan and delete/save preserve source-linked canonical pixels and unknown heights.
`./test-runner-protocol.sh` — passed eight real runner/queue/storage/database journeys after the immutable-parent lock fix (`geometry-drafts-parent-lock-fixed.log`), including immutable initial/moved parents and one winner/one conflict under concurrent saves.
Thirteen intake/schema/source-authority regressions pass (`geometry-editor-schema-access-final.log`); nine workspace types and lint/boundaries pass. Full unit suite: 120 passed (`geometry-editor-unit-final.log`). Exact migrations/models and 357 canonical operations are generated. Initial row-lock and container-env failures are retained, corrected without weakening RLS.

## Limitations
No room/opening/scale/split/multi-floor/autosave/3D or full engine completion is claimed here. The new editor route has no human parity approval, and inventory navigation/application/publication remains separate HE-R07 work. No actual customer plan, official measurement, GPU reconstruction or headset acceptance.

## Next dependency
HE-E04 openings/room labels and HE-E05 scale anchors; then editing/conflicts/render and 3D tasks.

## O
Only self-authored, authorized synthetic source pixels and actual private server-session browser journeys. No human-approved visual measurements or customer data.

## R
Supplied source-provenance, API-owned business rules, immutable version and unscaled/unknown-height requirements.

## P
Actual source/storage/decoder/API/PostgreSQL/desktop/mobile behavior; no simulated processing outputs.

## V
Abu Dhabi document holdout, approved visual parity, GPU/camera/splat/device/headset and independent publication gates remain pending.
