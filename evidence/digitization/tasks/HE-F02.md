## Acceptance
Extract frames and retain camera/lens metadata. Accepted after HE-F01.
Minimum: Frame timestamps and orientation match known fixture.

## Implementation
Pinned FFmpeg7.1.5 static recipe adds only select/showinfo filters; actual new binary hashes and unchanged source/package/license pins are recorded. Confined native selection samples by decoded presentation time at one fps without output-frame duplication. Sanitized selected PTS, actual time base and decoded timestamps accompany each upright640-bound canonical frame. Index/time-base/timestamp/orientation/dimension/hash/byte-count consistency is checked again in API. Missing, conflicting or malformed camera/lens/focal tags stay null; retained explicit tags are private container_tags_unverified, never inferred intrinsics. GPS and device serials are omitted. Private frame artifacts commit only against current source bytes/fresh Clam/hash, actor/input/version/workflow/lease. Successful runs await review; replay is idempotent; cancellation cleans raw frames and canonical previews. Frame metadata never becomes a plan-page transform or public approval.

## Tests
`docker compose -f services/property-processing/compose.tests.yaml run --rm --no-deps cpu python -m pytest -p no:cacheprovider -q tests` passes90 checks in frame-select-full-cpu-regressions.log. Three frame checks genuinely decode the self-authored three-second rotated clip and verify timestamps0/1/2 with actual PTS/time-base equality, every upright quadrant pixel, no private image metadata, explicit missing/conflicting camera fields and source/output guards. Twelve direct frame/media checks pass in frame-select-native-orientation-timestamps.log.
`./test-runner-protocol.sh media-frames` passes one actual API/database/S3/Clam/isolated-worker journey in frame-select-private-corrected-workflow.log: three private/pending frame artifacts retain exact decoded timestamps and null camera fields; changed source bytes block commit, replay is one receipt, wrong fence/foreign scope are denied, no plan pages appear and run awaits review.
Full units142/46, nine types and corrected API typecheck, lint/boundaries,375-operation canonical contracts, compiled API154files and processing licenses pass. Local development readiness advertises both private frame and panorama candidate profiles: frame-select-development-enabled-readiness.log. No active executions were interrupted. Initial test SQL quotation and control-regex lint errors are retained with corrected positive runs.

## Limitations
Bounded private small-video profile only:10MiB input,15-second aggregate decoder budget, at most600 selected frames,16MiB raw plus16MiB canonical output and existing total-raster budget. Large capture receipts stay quarantined and legacy limits are preserved. One-fps selection is a versioned initial profile, not a claim that150–600 useful frames or throughput was benchmarked. Negative/nonmonotonic/ambiguous timestamps fail closed. Real camera/lens accuracy, intrinsics, overlapping customer datasets, country holdouts, physical GPU/headset/performance and production clearance remain unverified.

## Next dependency
HE-F03 actual blur/duplicate/frame-group filtering, then privacy masks and reconstruction prerequisites.

## O
Self-authored CC0 quadrant clip genuinely looped/encoded with existing development FFmpeg5.1.9; synthetic scan metadata with actual byte rescans/decoding. No customer or actual human review claim.

## R
Preserved specification, pinned FFmpeg upstream source, Abu Dhabi priority and document-derived fixed-empty rule.

## P
Actual constrained native build, decoder isolation, API artifacts, local readiness and retained tests described above.

## V
No public publication, invented measurements, human/parity approval, hardware benchmark, production or whole-engine completion.

## Furnished property capture follow-up — 13 October 2026 (O/R/P/V)

O/R: user requested a generated property example instead of the unrelated desk reference. P: `evidence/digitization/property-capture/README.md` records original apartment images/video, 48/48 actual COLMAP cameras, the PNG thread-bound fix, 3,000-step GPU training, finite loadable checkpoint, exported tiers/held-out renders and the passing browser scene/orbit/reset/direct-link journey. V: synthetic local investigation, approximate surfaces and unverified scale/coverage; no independent review, production admission or broader task acceptance. This follow-up does not change task status or satisfy unfinished prerequisites. VR remains paused.

## Furnished two-bedroom capture — 14 October 2026 (O/R/P/V)

O/R: the user requested high-resolution furnished 2BHK assets, actual capture-derived reconstruction and agent-accessible steps, with minimum functional testing. P: generated 204 coherent 1920×1440 views in 17 uploaded clips; the agent selected 178 reviewed/177 usable frames. COLMAP recovered a connected 175-view model with 18,149 points. Actual gsplat job `691d2680-e58b-46af-a936-f755241d0591` completed 6,000 steps and exported 75,000 splats in 620.59 seconds, no fallback. V: the weights-only checkpoint is finite/loadable, both splat tiers and 15 held-out PNGs validate (`evidence/digitization/2bhk/final-gpu-verification.json`). The normal agent browser workflow passes scene load, all captured viewpoints, orbit/reset and direct auto-open (`functional-final-room-selection.log`). All inputs are RGB; no manual geometry or generator poses enter reconstruction.

V: this is a private generated test apartment with recognizable furniture and some soft/incomplete surfaces. It is not a photoreal real-address scan, metric/editable CAD, independent review, public publication or production/native distribution admission. Unfinished prerequisites and exact task status remain unchanged. VR remains paused. See `evidence/digitization/2bhk/README.md` for the current example and all prior failures.
