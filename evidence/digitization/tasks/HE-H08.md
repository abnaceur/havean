# HE-H08 — Software implementation in progress

Status: in_progress.

Implemented bounded binary scene validation rejecting NaN/infinity/extreme scales/empty or invisible scenes, bad quaternions/bounds/attributes and mismatched payload lengths. Training code computes actual held-out render MSE/PSNR and private thumbnails with temporal neighbour exclusions; no GPU render has run and geometric independence/human review remain explicitly unverified.

O: authored binary/PNG fixtures and actual CC BY4.0 TUM capture; retained initial model-path failure.
R: preserved specification, private scoped execution, exact prerequisites and required real GPU/viewer acceptance.
P: training-input-export-tests.log (29 checks), training-supervision-tests.log (29 checks), training-export-all-cpu-tests.log (152 checks before supervision), and training-input-real-cpu-preparation-corrected.log (real reconstruction and sixteen undistorted calibrated views).
V: source profile is an investigation, distribution admission is incomplete, GPU validation is explicitly deferred, real trained checkpoint/held-out renders/viewer/headset acceptance and full task completion are not claimed.

## Furnished property capture follow-up — 13 October 2026 (O/R/P/V)

O/R: user requested a generated property example instead of the unrelated desk reference. P: `evidence/digitization/property-capture/README.md` records original apartment images/video, 48/48 actual COLMAP cameras, the PNG thread-bound fix, 3,000-step GPU training, finite loadable checkpoint, exported tiers/held-out renders and the passing browser scene/orbit/reset/direct-link journey. V: synthetic local investigation, approximate surfaces and unverified scale/coverage; no independent review, production admission or broader task acceptance. This follow-up does not change task status or satisfy unfinished prerequisites. VR remains paused.

## Furnished two-bedroom capture — 14 October 2026 (O/R/P/V)

O/R: the user requested high-resolution furnished 2BHK assets, actual capture-derived reconstruction and agent-accessible steps, with minimum functional testing. P: generated 204 coherent 1920×1440 views in 17 uploaded clips; the agent selected 178 reviewed/177 usable frames. COLMAP recovered a connected 175-view model with 18,149 points. Actual gsplat job `691d2680-e58b-46af-a936-f755241d0591` completed 6,000 steps and exported 75,000 splats in 620.59 seconds, no fallback. V: the weights-only checkpoint is finite/loadable, both splat tiers and 15 held-out PNGs validate (`evidence/digitization/2bhk/final-gpu-verification.json`). The normal agent browser workflow passes scene load, all captured viewpoints, orbit/reset and direct auto-open (`functional-final-room-selection.log`). All inputs are RGB; no manual geometry or generator poses enter reconstruction.

V: this is a private generated test apartment with recognizable furniture and some soft/incomplete surfaces. It is not a photoreal real-address scan, metric/editable CAD, independent review, public publication or production/native distribution admission. Unfinished prerequisites and exact task status remain unchanged. VR remains paused. See `evidence/digitization/2bhk/README.md` for the current example and all prior failures.
