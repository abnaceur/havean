# HE-H06 — Software implementation in progress

Status: in_progress.

Implemented a private fixed-density gsplat training investigation wrapper, pinned source commit 937e29912570c372bed6747a5c9bf85fed877bae and rendering-source checksum, proposed exact torch2.7.1+cu126/CUDA12.6/gsplat1.5.3 versions, actual COLMAP undistortion input preparation, tensor/optimizer/RNG checkpoints and strict dataset/profile/hash resume checks. Runtime wheels/native dependencies are not admitted and real GPU execution is explicitly deferred by the user; this does not satisfy the GPU minimum test.

O: authored binary/PNG fixtures and actual CC BY4.0 TUM capture; retained initial model-path failure.
R: preserved specification, private scoped execution, exact prerequisites and required real GPU/viewer acceptance.
P: training-input-export-tests.log (29 checks), training-supervision-tests.log (29 checks), training-export-all-cpu-tests.log (152 checks before supervision), and training-input-real-cpu-preparation-corrected.log (real reconstruction and sixteen undistorted calibrated views).
V: source profile is an investigation, distribution admission is incomplete, GPU validation is explicitly deferred, real trained checkpoint/held-out renders/viewer/headset acceptance and full task completion are not claimed.

## Current local continuation — 12 October 2026 (O/R/P/V)

O/P: Local CPU camera stages now traverse the durable API/queue/worker with immutable recipe/frame/source lineage, confinement, private calibrated export and review reports. The actual queued reference-derived clip registers16 views/3364 points; no metric scale, room coverage, physical property or GPU result is inferred. Recovery now describes47 tables in v6 while preserving historical versions; only the focused descriptor validation was rerun. Evidence: `camera-private-download-functional-validation.log`, `camera-export-budget-functional-validation.log`.

R/V: exact original acceptance and prerequisites remain mandatory. Production model/native admission, representative country/property/calibration inputs, physical GPU/headset, independent human/parity and current release/recovery gates remain unaccepted. Status stays in_progress; no whole-engine completion.


## GPU validation remains deferred; calibrated handoff and recovery — 12 October 2026 (O/R/P/V)

O: the user explicitly reaffirmed “Keep GPU validation deferred”. VR remains paused in the UI. No GPU driver setup, CUDA training or headset validation was performed.

P: the supervised training CLI now accepts the actual private calibrated camera tar with mandatory SHA-256 and optional dataset fingerprint. Extraction admits only the exact bounded regular model/image members, validates calibrated image hashes, and removes temporary pixels on exit. The real retained16-view CPU dataset passes checksum, traversal and cleanup checks in `training-calibrated-archive-corrected-functional.log`; this is input handoff evidence, not trained-scene evidence.

P: training now persists a fsynced wall-clock reservation and excludes concurrent attempts. Graceful interruption charges time since the last model checkpoint. A killed supervisor leaves its full reservation charged, so resume cannot reset its time allowance. Incomplete scene/render/export files can be cleared after checkpoint validation without deleting checkpoints; completed outputs refuse resume. `training-no-network-final-functional.log` passes six focused CPU functional checks including real subprocess termination/SIGKILL. The CPU test service uses network_mode:none, avoiding unnecessary Docker address-pool allocation. Earlier failed/corrected archive/supervision runs remain retained.

P: the targeted current recovery initially refused the isolated integration database because migration225 was absent. The normal migration command applied225 (`camera-integration-migration-functional.log`). `camera-current-47-table-recovery-corrected-functional.log` then passes signed encrypted database/object/runner restoration with47 table proofs, tamper and signed-history-drift refusal, interrupted source upload, actual completed decoder/preview recovery, tombstone retention and stale-request refusal. The47th table is present but has no camera rows in this integration snapshot; this is not a populated camera-run recovery or a new full restored-application/off-host rehearsal. The old46-table full application result remains historical.

R/V: preserve exact original acceptance and ordered prerequisites. Engine remains54/95 accepted,39 non-VR unfinished and2 VR paused; root remains120/120. Remaining implementation includes production OCR/native distribution admission and durable GPU training-to-artifact integration. Representative country/property/calibration inputs, physical-device results and current full application/remote-CI/production acceptance remain outstanding. CPU handoff, authored export guards and recovery do not satisfy the deferred real GPU minimums. Release must continue refusing unfinished tasks.



## Agent reconstruction status — 13 October 2026 (O/R/P/V)

O/R: user explicitly selected COLMAP + gsplat, retaining GPU-validation deferral. P: one real agent browser journey exercises background CPU camera solving with live progress and reload recovery (16 views/3,354 sparse points). Camera status cannot masquerade as trained-scene readiness. Evidence: `evidence/digitization/reconstruction-progress.md`. V: durable gsplat job submission and fenced trained-output collection remain unimplemented; real GPU minimum acceptance is still deferred. This task stays in_progress.


## Durable gsplat training/export integration — 13 October 2026 (O/R/P/V)

O/R: user requested construction of COLMAP + gsplat while retaining explicit GPU-validation deferral and paused VR. P: wired calibrated camera results to actor/version/revision-bound training and export jobs, a separately keyed confined runner, exclusive GPU reservation handling, bounded checksummed private scene collection, cancellation/deletion routing and agent status/review controls. Migration227 is applied locally and in isolated integration. One real SQL/S3/signed-HTTP journey using authored runner output, two CPU confinement/output checks and one real disabled-GPU browser check pass, alongside focused types/contracts/recovery-descriptor validation. Evidence: `evidence/digitization/gsplat-integration.md`; runtime preparation: `docs/runbooks/gsplat-investigation.md`.

V: supersedes the earlier missing durable-integration statement below. The optional GPU image was not built or started; no CUDA run or real scene-quality claim. The existing public property remains authored geometry. GPU runtime/native admission and exact real-GPU task acceptance remain deferred; cross-attempt job resume is not completed. No independent human review, physical-property accuracy, production release or new full recovery rehearsal. Counts stay root120/120, engine56/95, with37 non-VR unfinished and2pausedVR. No task is newly marked done.



## GPU use authorized; host driver repair required — 13 October 2026 (O/R/P/V)

O/R: user now explicitly requested “use the GPU”, lifting the previous GPU-validation deferral. VR remains paused. P: actual host and Docker device checks attempted. The GTX1650Ti Mobile PCI device is present, but running kernel7.0.0-34-generic has no NVIDIA module. Driver595.84 and its module exist for older kernel7.0.0-31; current-kernel package595.91.07 is available. The Docker NVIDIA runtime exists but fails device admission. `sudo -n true` requires a password. Existing unrelated baidunetdisk dependencies also block APT; a simulated repair installs six libraries with no removals. Prepared `scripts/repair-gsplat-gpu-host.sh` for interactive local sudo, dependency repair, current-kernel driver installation and modprobe; it refuses removals and does not reboot. User was asked to run it locally without sharing their password.

V: GPU work is authorized, not deferred, but remains blocked by host administrator access. No CUDA/training success, runtime build, completed scene, GPU acceptance or public-property replacement is claimed. Evidence: `evidence/digitization/gsplat-host-admission.json`, `gsplat-device-probe.log`, `gsplat-host-package-repair-preview.log`. After repair run `docker compose -f compose.gsplat-probe.yaml run --rm gpu-probe`, then prepare the pinned gsplat runtime and execute the real calibrated fixture. Task counts unchanged: root120/120, engine56/95;37 non-VR unfinished and2pausedVR.



## Real GPU reconstruction generated — 13 October 2026 (O/R/P/V)

O/R: user authorized GPU use and local driver repair; credentials stayed in sudo. P: NVIDIA595.99.02/DKMS now runs on GTX1650Ti4GiB without reboot. A pinned gsplat1.5.3/torch2.7.1+cu126 SM75 runtime is active on the private development runner. The agent action completed actual500-step training and private export from the licensed16-view reference capture:3,354 splats,18.5575 seconds including held-out evaluation/export, no OOM fallback. A weights-only load verifies the500-step checkpoint and finite parameters. Both107,328-byte viewer tiers and188,184-byte PLY are nonempty and checksummed. The real browser journey passes download, orbit, zoom and reset. Evidence: `evidence/digitization/gsplat-real-functional.md` and `gsplat-real-result.json`.

P: fixed real CUDA sandbox startup, job-local export moves, temporary-file ordering, the missing native-loader dependency and overly large uniform splat initialization. Local-neighbour sizing makes captured desk objects recognizable in held-out renders; preview framing now avoids distant outliers. View as Agent Demo: http://localhost:8089/ops/digitization?workspace=9acf2520-a922-4b23-830e-0a55aa0b97a6#digitization-scene and open the scene preview.

V: this is a rough partial reference desk-area scan, not the authored apartment or a complete furnished property/metric floor plan. No independent render/privacy approval, public publication, editable furniture inference, production/native distribution admission or full GPU fault/recovery acceptance. VR remains paused. HE-H06's exact real-checkpoint/scene minimum passes; task remains in_progress because prerequisite HE-H03 is unfinished. Counts unchanged: root120/120, engine56/95,37 unfinished non-VR plus2pausedVR. Older blocked/deferred notes below are historical and superseded by this update.

Minimum test command (load ignored `infra/generated/gsplat-runtime.env` into the environment first):

```sh
docker compose -f compose.yaml -f compose.digitization.yaml -f compose.gsplat-investigation.yaml exec -T processing-gpu python - /jobs/8c1962f6-0c96-4686-ad98-2abdf6ed5f48/training < evidence/digitization/verify-gsplat-result.py
```

Result: passed. `gsplat-real-result.json` records actual checkpoint/scene hashes and numeric measurements. Acceptance remains in_progress until HE-H03 is accepted.

## Photo/video workflow correction — 13 October 2026 (O/R/P/V)

See [capture reconstruction evidence](../photo-reconstruction.md) for real-photo admission, immutable source checks and the agent capture-to-scene workflow. No task acceptance is advanced by this follow-up.

## Furnished property capture follow-up — 13 October 2026 (O/R/P/V)

O/R: user requested a generated property example instead of the unrelated desk reference. P: `evidence/digitization/property-capture/README.md` records original apartment images/video, 48/48 actual COLMAP cameras, the PNG thread-bound fix, 3,000-step GPU training, finite loadable checkpoint, exported tiers/held-out renders and the passing browser scene/orbit/reset/direct-link journey. V: synthetic local investigation, approximate surfaces and unverified scale/coverage; no independent review, production admission or broader task acceptance. This follow-up does not change task status or satisfy unfinished prerequisites. VR remains paused.

## Furnished two-bedroom capture — 14 October 2026 (O/R/P/V)

O/R: the user requested high-resolution furnished 2BHK assets, actual capture-derived reconstruction and agent-accessible steps, with minimum functional testing. P: generated 204 coherent 1920×1440 views in 17 uploaded clips; the agent selected 178 reviewed/177 usable frames. COLMAP recovered a connected 175-view model with 18,149 points. Actual gsplat job `691d2680-e58b-46af-a936-f755241d0591` completed 6,000 steps and exported 75,000 splats in 620.59 seconds, no fallback. V: the weights-only checkpoint is finite/loadable, both splat tiers and 15 held-out PNGs validate (`evidence/digitization/2bhk/final-gpu-verification.json`). The normal agent browser workflow passes scene load, all captured viewpoints, orbit/reset and direct auto-open (`functional-final-room-selection.log`). All inputs are RGB; no manual geometry or generator poses enter reconstruction.

V: this is a private generated test apartment with recognizable furniture and some soft/incomplete surfaces. It is not a photoreal real-address scan, metric/editable CAD, independent review, public publication or production/native distribution admission. Unfinished prerequisites and exact task status remain unchanged. VR remains paused. See `evidence/digitization/2bhk/README.md` for the current example and all prior failures.
