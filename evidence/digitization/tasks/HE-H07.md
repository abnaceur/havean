# HE-H07 — Software implementation in progress

Status: in_progress.

Implemented cumulative resume budgets, external process-group wall-clock supervision, cancellation termination, bounded checkpoint retention and one lower-resolution OOM fallback. Actual CPU child processes complete, cancel and get killed when ignoring SIGTERM. Real CUDA interrupt/resume/OOM acceptance remains deferred, not inferred from these process checks.

O: authored binary/PNG fixtures and actual CC BY4.0 TUM capture; retained initial model-path failure.
R: preserved specification, private scoped execution, exact prerequisites and required real GPU/viewer acceptance.
P: training-input-export-tests.log (29 checks), training-supervision-tests.log (29 checks), training-export-all-cpu-tests.log (152 checks before supervision), and training-input-real-cpu-preparation-corrected.log (real reconstruction and sixteen undistorted calibrated views).
V: source profile is an investigation, distribution admission is incomplete, GPU validation is explicitly deferred, real trained checkpoint/held-out renders/viewer/headset acceptance and full task completion are not claimed.


## Child-exit/cancellation observation — 11 October2026 (O/P)

The real isolated CPU child exits while a cancellation callback is delayed. supervise returns reason=cancelled with exitCode=0 without an exception (training-supervisor-exit-cancel-race-reproduction.log). No implementation change was needed. This is actual process lifecycle evidence, not a CUDA training, checkpoint or resume result. R: preserve explicit cancellation and bounded process supervision. V: real GPU interrupt/resume/fallback acceptance stays deferred/unverified.


## GPU validation remains deferred; calibrated handoff and recovery — 12 October 2026 (O/R/P/V)

O: the user explicitly reaffirmed “Keep GPU validation deferred”. VR remains paused in the UI. No GPU driver setup, CUDA training or headset validation was performed.

P: the supervised training CLI now accepts the actual private calibrated camera tar with mandatory SHA-256 and optional dataset fingerprint. Extraction admits only the exact bounded regular model/image members, validates calibrated image hashes, and removes temporary pixels on exit. The real retained16-view CPU dataset passes checksum, traversal and cleanup checks in `training-calibrated-archive-corrected-functional.log`; this is input handoff evidence, not trained-scene evidence.

P: training now persists a fsynced wall-clock reservation and excludes concurrent attempts. Graceful interruption charges time since the last model checkpoint. A killed supervisor leaves its full reservation charged, so resume cannot reset its time allowance. Incomplete scene/render/export files can be cleared after checkpoint validation without deleting checkpoints; completed outputs refuse resume. `training-no-network-final-functional.log` passes six focused CPU functional checks including real subprocess termination/SIGKILL. The CPU test service uses network_mode:none, avoiding unnecessary Docker address-pool allocation. Earlier failed/corrected archive/supervision runs remain retained.

P: the targeted current recovery initially refused the isolated integration database because migration225 was absent. The normal migration command applied225 (`camera-integration-migration-functional.log`). `camera-current-47-table-recovery-corrected-functional.log` then passes signed encrypted database/object/runner restoration with47 table proofs, tamper and signed-history-drift refusal, interrupted source upload, actual completed decoder/preview recovery, tombstone retention and stale-request refusal. The47th table is present but has no camera rows in this integration snapshot; this is not a populated camera-run recovery or a new full restored-application/off-host rehearsal. The old46-table full application result remains historical.

R/V: preserve exact original acceptance and ordered prerequisites. Engine remains54/95 accepted,39 non-VR unfinished and2 VR paused; root remains120/120. Remaining implementation includes production OCR/native distribution admission and durable GPU training-to-artifact integration. Representative country/property/calibration inputs, physical-device results and current full application/remote-CI/production acceptance remain outstanding. CPU handoff, authored export guards and recovery do not satisfy the deferred real GPU minimums. Release must continue refusing unfinished tasks.



## Durable gsplat training/export integration — 13 October 2026 (O/R/P/V)

O/R: user requested construction of COLMAP + gsplat while retaining explicit GPU-validation deferral and paused VR. P: wired calibrated camera results to actor/version/revision-bound training and export jobs, a separately keyed confined runner, exclusive GPU reservation handling, bounded checksummed private scene collection, cancellation/deletion routing and agent status/review controls. Migration227 is applied locally and in isolated integration. One real SQL/S3/signed-HTTP journey using authored runner output, two CPU confinement/output checks and one real disabled-GPU browser check pass, alongside focused types/contracts/recovery-descriptor validation. Evidence: `evidence/digitization/gsplat-integration.md`; runtime preparation: `docs/runbooks/gsplat-investigation.md`.

V: supersedes the earlier missing durable-integration statement below. The optional GPU image was not built or started; no CUDA run or real scene-quality claim. The existing public property remains authored geometry. GPU runtime/native admission and exact real-GPU task acceptance remain deferred; cross-attempt job resume is not completed. No independent human review, physical-property accuracy, production release or new full recovery rehearsal. Counts stay root120/120, engine56/95, with37 non-VR unfinished and2pausedVR. No task is newly marked done.

