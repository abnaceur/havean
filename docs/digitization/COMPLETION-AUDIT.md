## HE-D03 completed: exact document normalization — 12 October 2026 (O/R/P/V)

O/R: user requested the next task. HE-D03 follows accepted HE-A03/HE-D02; its original acceptance remains normalization of decimals, units, IDs and calendars, with `184,20 m²` normalized correctly and leading-zero IDs retained as strings.

P: existing runtime implementation meets this task; no new runtime changes were needed. Three focused current CPU cases and three API/contract cases pass (`normalization-minimum-cpu-functional.log`, `normalization-minimum-api-functional.log`). They cover French decimal strings/area basis, original evidence, leading-zero IDs, Arabic quantity checks, explicit calendars/precision and invalid or tampered value refusal. All other cases were deselected; prior accepted real OCR evidence is reused. No broad suite, model rebuild, GPU or VR test was run. Exact commands and scope are in `evidence/digitization/tasks/HE-D03.md`.

V: engine56/95 accepted;35 in_progress,2 todo,2 paused. There are37 non-VR unfinished tasks plus2 paused VR tasks; root remains120/120. HE-D04 extraction/abstention is next. Representative country/property accuracy, remaining reconstruction/integration, physical-device/human/parity and production release gates remain outstanding. GPU validation remains deferred and VR paused. No deployment occurred; release must refuse unfinished tasks.

## HE-D02 completed: offline production OCR package — 12 October 2026 (O/R/P/V)

O: authorized self-authored English/French/Arabic PDF and PNG fixtures, actual confined runner/API/SQL/S3 results and checksum-pinned publisher artifacts. The user requested completion of the first remaining item, production document processing. GPU validation stays deferred; VR stays paused.

R/P: HE-D02 now meets its unchanged acceptance and exact minimum: a real locale-aware worker produces nonempty source-linked tokens for all three languages. The separately gated production package retains63 exact wheels,4 models,270 runtime files,333 notices and55 source/distribution archives. Matching native provenance, required corresponding sources, reproducible Compose bootstrap/build, strict release-SHA activation, production API manifest packaging, private runner configuration and the release runbook are complete. A second-collector receipt race exposed by the functional check is fixed without bypassing actor/scope/version/workflow checks. Original failed attempts remain retained.

P: `ocr-production-final-functional-journey.log` passes four focused real OCR journeys on final image `sha256:10f946939efd523188b68202fc9af3e6d25a7d2ff6d4c8cce2f41599911525f8`; one redundant JPEG case is skipped. Four activation/refusal checks, final bundle/image/license gates, generated contracts, API types, focused lint and synthetic production Compose validation pass. `ocr-production-runtime-equivalence.json` records that the old intermediate image was unavailable, so the four final-image checks were rerun instead of claiming equivalence. See `evidence/digitization/tasks/HE-D02.md` and `docs/runbooks/ocr-release.md`. No broad suite or GPU/headset validation was run.

V: engine55/95 accepted;36 in_progress,2 todo and2 paused, leaving38 non-VR tasks plus2 paused VR tasks. Root remains120/120. This supersedes earlier statements that OCR distribution admission is pending; it does not accept country/property accuracy, GPU training-to-artifact integration, physical-device/human/parity results, current full recovery/remote CI or production release. The package is built and validated locally; no registry push or deployment occurred. Release must continue refusing unfinished tasks.

Final ledger validation passes: platform120/120 and engine55/95 (`ocr-production-platform-ledger.log`, `ocr-production-engine-ledger.log`). Release correctly exits1 for40 unfinished engine tasks, including both paused VR tasks, and existing external release gates (`ocr-production-release-refusal.log`). HE-D02 is absent from the unfinished list. Final whitespace validation passes (`ocr-production-final-diff-check.log`).

## GPU validation remains deferred; calibrated handoff and recovery — 12 October 2026 (O/R/P/V)

O: the user explicitly reaffirmed “Keep GPU validation deferred”. VR remains paused in the UI. No GPU driver setup, CUDA training or headset validation was performed.

P: the supervised training CLI now accepts the actual private calibrated camera tar with mandatory SHA-256 and optional dataset fingerprint. Extraction admits only the exact bounded regular model/image members, validates calibrated image hashes, and removes temporary pixels on exit. The real retained16-view CPU dataset passes checksum, traversal and cleanup checks in `training-calibrated-archive-corrected-functional.log`; this is input handoff evidence, not trained-scene evidence.

P: training now persists a fsynced wall-clock reservation and excludes concurrent attempts. Graceful interruption charges time since the last model checkpoint. A killed supervisor leaves its full reservation charged, so resume cannot reset its time allowance. Incomplete scene/render/export files can be cleared after checkpoint validation without deleting checkpoints; completed outputs refuse resume. `training-no-network-final-functional.log` passes six focused CPU functional checks including real subprocess termination/SIGKILL. The CPU test service uses network_mode:none, avoiding unnecessary Docker address-pool allocation. Earlier failed/corrected archive/supervision runs remain retained.

P: the targeted current recovery initially refused the isolated integration database because migration225 was absent. The normal migration command applied225 (`camera-integration-migration-functional.log`). `camera-current-47-table-recovery-corrected-functional.log` then passes signed encrypted database/object/runner restoration with47 table proofs, tamper and signed-history-drift refusal, interrupted source upload, actual completed decoder/preview recovery, tombstone retention and stale-request refusal. The47th table is present but has no camera rows in this integration snapshot; this is not a populated camera-run recovery or a new full restored-application/off-host rehearsal. The old46-table full application result remains historical.

R/V: preserve exact original acceptance and ordered prerequisites. Engine remains54/95 accepted,39 non-VR unfinished and2 VR paused; root remains120/120. Remaining implementation includes production OCR/native distribution admission and durable GPU training-to-artifact integration. Representative country/property/calibration inputs, physical-device results and current full application/remote-CI/production acceptance remain outstanding. CPU handoff, authored export guards and recovery do not satisfy the deferred real GPU minimums. Release must continue refusing unfinished tasks.

## VR paused; non-VR camera review corrected — 12 October 2026 (O/R/P/V)

O: user explicitly paused VR and requested completion of the remaining engine. HE-I05 and HE-I06 are now `paused`, retaining their original acceptance and dependencies. Headset entry and capability probing are disconnected from the structural viewer; the reusable session controller is retained for later resumption. Structural, panorama and splat viewers show a visible pause notice. The ordinary panorama tab now reads “360° tour”. Browser 3D and room-hotspot navigation remain available.

R: preserve the supplied specification and exact acceptance. A paused task is unfinished: the ledger schema accepts this state, and full release validation still refuses it. GPU validation remains deferred under the earlier user instruction; pausing VR does not complete or remove GPU reconstruction, device or release requirements.

P: `vr-pause-structural-functional-retry.log` passes one actual desktop structural-viewer journey (room selection, keyboard zoom/reset, wall cutaway, repeated open/close and pause notice). The initial attempt did not run because the isolated proxy was stopped; `vr-pause-structural-functional.log` retains that failure. The existing polling gateway was restarted without changing source data. `vr-pause-release-guard.log` passes one focused paused-ledger/release-refusal check. `camera-disconnected-review-functional.log` passes one synthetic multi-model projection check: counts from the largest model stay separate, while connected components include all returned models, avoiding shared-view double counting. `camera-quality-current-browser-functional.log` passes the current retained real CPU result through scoped API/OIDC and both operator review sections; it reuses the existing 16-view/3364-point result without repeating reconstruction. This does not supply a real disconnected-property benchmark. Changed UI/API/ops/web types pass in `vr-pause-*-types.log`.

V: engine acceptance remains54/95;37 in_progress,2 todo,2 paused. There are39 non-VR unfinished tasks. Remaining software includes production OCR/native packaging/admission and GPU training-to-artifact integration; real training/resume/export cannot be accepted on the deferred/unavailable CUDA runtime. Authorized representative property/country inputs, named physical-device measurements, current full47-table restore, remote CI and independent production/reference acceptance remain unverified. Optional structured suggestions stay disabled and are not a baseline prerequisite. No full non-VR feature or release completion is claimed.

Final focused checks: `vr-pause-final-focused-lint.log` and `vr-pause-camera-focused-lint.log` pass. `vr-pause-dependency-gate.log` passes with8 pinned base packages,0 production-enabled models and GPU unavailable. Root/engine ledgers validate in `vr-pause-platform-ledger.log` and `vr-pause-engine-ledger.log`; `vr-pause-release-refusal.log` correctly exits1, explicitly retaining HE-I05/HE-I06 as paused plus39 other unfinished engine tasks and the existing root release gates. `vr-pause-final-diff-check.log` passes. No full suite, GPU/headset test or repeated camera solve was run.

## Private CPU camera workflow and optional suggestions — 12 October 2026 (O/R/P/V)

O/P: local camera reconstruction now runs through the durable API/outbox/queue/worker path, not only the offline CLI. SQL225 stores immutable, actor/revision/recipe-bound archive descriptors. Actual selected frame pixels are masked and checksum-verified before transfer and collection. Native COLMAP commands run under Landlock/seccomp with no networking, foreign-file access or process creation, fixed executable/loader paths, bounded time/scratch, cancellation and cleanup. Private calibrated training archives are checksum-verified in storage and downloadable through the scoped server-session API. Operations exposes camera submission and the current private quality report; the quality summary includes actual camera/connectivity counts without inferring scale or room coverage.

`camera-queued-functional-journey.log` passes the running development stack with a licensed TUM-derived authored one-fps clip:16 decoded/selected/registered views,3364 sparse points,one connected model, source mask, calibrated archive, idempotent request replay, foreign-scope/stale-version refusal and cancellation. Retained private workspace `9acf2520-a922-4b23-830e-0a55aa0b97a6`, run `7ac49c88-7005-4e88-aded-dd4f5b334742`, report `18af0509-8351-468c-b39b-1879022b2073`; nothing published. `camera-private-download-functional-validation.log` verifies8601600 bytes and SHA256 `147b5bf41e53e543836dcea106611e16cf67b92f76ba70fd3f6c8d816e6819bf`, including foreign-scope refusal. The separate real durable runner check passes restart/replay, scoped export, traversal refusal and purge (`camera-durable-functional-validation.log`); its observed camera/training work took28.244914959 seconds and205225984 bytes maximum completed-child RSS, not aggregate memory/GPU/VRAM/FPS. The separate kernel confinement check passes (`colmap-confined-kernel-corrected-functional-validation.log`). Export budget refusal also passes on real calibrated inputs (`camera-export-budget-functional-validation.log`).

O/P: optional structured suggestions now have an API-owned, disabled-by-default private HTTP transport and a persisted state on document receipts. Only a fixed internal service and configured profile hash/key can be used; models select already grounded candidate IDs and cannot change values, evidence, review state, inventory or publication. Missing configuration, service failure and rejected claims preserve generic extraction/manual review. A local protocol fixture verifies valid suggestions, unsupported claim refusal, disabled/no-configuration behavior and forbidden destination refusal (`structured-provider-canonical-evidence-functional-validation.log`). It is a protocol fixture, not an actual model accuracy result. Actual queued OCR still reaches one pending source-linked fact with enrichment disabled (`structured-provider-disabled-ocr-functional-journey.log`). No structured model/service is deployed or admitted.

R/P: only focused functional checks and changed-workspace types/lint were used. The new recovery descriptor is v6/47 tables, retaining immutable v1–v5 coverage; two focused descriptor checks pass (`camera-recovery-descriptor-functional-validation.log`). The previously passing46-table restored-application drill is historical; no47-table full restore is claimed.438 typed API operations are generated. Original failed build/contract/type attempts remain retained alongside corrected passing evidence. Use `./dev-camera.sh` to activate the cached local OCR/media/camera composition and `./dev-camera.sh --build` after worker-source changes. This host uses the camera override.

V: exact accepted count remains54/95, with41 unfinished (38 in_progress,3 todo); root platform120/120 is separate. Production native/model distribution admission, representative independent country/property/lens-switch/disconnected-room captures, deployed/admitted optional model, real GPU training/resume/export/device/headset results, independent human/parity, current full recovery/remote CI and production release acceptance remain unfinished. GPU validation retains the earlier user deferral. Current local camera/provider transport progress supersedes older statements that these paths have no durable integration; it does not certify R1–R4 or close dependent tasks.

Final focused validation: changed contracts/API/worker/ops types and focused lint pass;438 generated operations; dependency gate passes8 pinned packages with0 production-enabled models; final API/runner are healthy and the private camera profile is advertised. Both ledgers validate (platform120/120;engine54/95). Release deliberately exits1 in `camera-provider-release-refusal.log` for41 unfinished engine tasks plus inaccessible Haven reference/physical review, deferred off-host recovery, failed remote CI and missing mandatory recorded outcomes. No release/production or full47-table restore pass is claimed. `camera-provider-final-diff-check.log` passes.

## Bounded phone-photo OCR — 12 October 2026 (O/R/P/V)

O/P: PNG and an authored approximately 6-megapixel EXIF-rotated JPEG pass source-start, real OCR, source-linked persistence, orientation, private preview and replay checks in `local-ocr-bounded-phone-photo-functional-validation.log` (two functional cases). The first resize candidate kept only a 4-megapixel area cap; the model split the unit suffix into a separate token and correctly produced no ungrounded quantity. That failed expected-fact result is retained in `local-ocr-phone-photo-functional-validation.log`. The final local image profile additionally bounds the long edge to 1600 pixels and preserves normalized original-to-upright coordinates and the original source checksum. Both cases now produce the explicitly printed pending quantity. This is authored fixture evidence, not general phone-photo accuracy. R/V: production/model distribution, country/property and physical-device gates stay open; accepted count remains54/95.

## Local scanned-document workflow available — 12 October 2026 (O/R/P/V)

The user's current instruction is to prioritize completion with the strict minimum functional checks. Reuse valid evidence; do not launch the broad software composite, restore drill or full suites without a change that needs them. Preserve exact acceptance and external gates.

Local development OCR is now opt-in through `./dev-ocr.sh` (existing cached images) or `DIGITIZATION_LOCAL_OCR=true ./dev.sh` (rebuild). It is active on this host. The combined versioned runtime retains the original private execution volume, signing key, native PDF/media profiles and cancellation/deletion ports. API-owned profile selection sends PDF/JPEG/PNG documents through native-first/source-linked OCR; the operator sees the image extraction action when enabled. Production/staging admission remains disabled. Restarting plain `./dev.sh` selects the baseline CPU configuration.

Functional evidence: `local-ocr-queued-corrected-functional-journey.log` passes an authored PNG through the actual running outbox/queue/worker/API/SQL/S3/OCR into one pending source-linked fact and preview. Retained private fixture workspace: `33462e6e-feca-4d62-afdc-bf1e6fe0f717`; no publication. `local-ocr-start-corrected-functional-validation.log` passes two actual PNG/EXIF-rotated-JPEG source-start/worker/persistence/review cases. Original collector flag and script tsconfig failures remain retained. The cached launcher passes and both API/runner are healthy. A redundant image rebuild stalled at pinned registry metadata and was cancelled; the already built and functionally checked images remain running.

The separate no-GUI OCR candidate passes real authored English/French/Arabic token extraction and multipage OCR (`ocr-no-gui-functional-smoke.log`). Its immutable audit inventories 235 native files and resolves every linked system-library name (`ocr-no-gui-native-audit.json`). This removes the earlier unused GUI-link gap, not full model/native redistribution admission. Actual Arabic/French imperfections remain visible in raw tokens.

Explicit unknown owner/city/identifier values now abstain in the disabled country profiles; five focused parser/benchmark checks pass (`country-unknown-functional-validation.log`). A single licensed TUM CPU workload registers 16 cameras/3232 points and prepares 16 training views in 35.840959658 seconds on the named i9-10885H. It reports 206184448 bytes maximum child RSS, exact input/runtime hashes and per-command durations (`reference-cpu-functional-workload.json`). These are local CPU observations, with GPU VRAM and viewer FPS unknown. HE-K07 advances to in_progress.

The three changed workspace type checks, focused lint, contract generation, shell syntax and processing dependency manifest validation pass. No broad retest was required. The earlier 16-lane composite stopped without a complete result; it is not a pass.

O: actual local services/queue/storage/model execution, authored documents and licensed TUM frames. R: scope/version/workflow, decimal strings, minimal functional checks and exact original acceptance. P: local opt-in functionality and measured CPU report above. V: complete native/model production admission, representative country/property inputs, GPU (previously deferred), physical headset, human/parity/off-host/production and remaining reconstruction/provider integration are unaccepted. Engine 54/95 accepted; 41 unfinished (38 in_progress, 3 todo). Root 120/120 remains separate. Do not call the full feature complete.

## Current46/v5 restored application passed — 11 October2026 (P)

`node scripts/recovery/test-processing.mjs --application` exits0 in derived-output-224-current-46-table-restored-application.log. All46 v5 table proofs reconcile, including durable output-writer history. Ciphertext tamper and deliberately signed writer-history drift are refused.2497 private original objects/118174349 bytes are copied and checksum-verified with aggregate cfa243f262dd500226303afe26c4077e305fb0822f6f53cebe8ac9b2243ace06 and sourceMutated=false. The current immutable migration224 runtime passes actual OIDC upload/queued CPU collection/source-linked review, independently reviewed shared-unit/canonical-location proposals, panorama and structural/authored-splat publication/public rendering/withdrawal, plus private multipart capture/scanning/binding/clip validation/frame extraction. Signed runner-volume restoration verifies actual decoder output, interrupted upload, completed receipt/preview/hash, deletion tombstone, stale-request refusal and no duplicate execution.

Observed local elapsed475782.570835ms covers clone/recovery/application verification and excludes final cleanup; it is not production RTO. The command exits0 after scoped owned cleanup. Original projects stay running. Five required recovery screenshots remain retained. The five runtime images match10 locked dependency volumes with no registry download; the only subsequent runtime-test-source edit is the fixture-provenance unit expectation7->8, with no API/worker/viewer/schema change. The earlier failed fixture-count check remains retained; its corrected guard passes.

The expanded16-lane software composite is now running in derived-output-current-sixteen-lane-software.log, including the new actual derived collector SIGKILL/full-lease lane; no whole composite pass is claimed yet. Current normal root/engine ledgers validate, and release correctly exits1 for41 unfinished engine tasks and existing reference/off-host gates. Engine54/95 accepted; root120/120 preserved.

O: actual local Compose SQL/S3/OIDC/CPU/browser recovery, authored PDF/PNG/triframe MP4/27-Gaussian fixtures and synthetic reviewers. R: exact actor/resource/version/workflow/decimal rules,46-table signed proof, immutable historical coverage and original-project preservation. V: physical GPU/headset, admitted trained scene/country/property models, human/parity and off-host/production release remain unfinished. Continue runnable work; no whole-engine completion.

## Current acceptance audit — 11 October 2026 (O/R/P/V)

The authoritative ledger records54/95 accepted and41 unfinished (37in_progress,4todo); root120/120 remains separate. HE-R07 is now accepted from exact reviewed inventory evidence. Current software covers private source review/assisted labels, independently reviewed panorama/structural/authored-splat publication and withdrawal, actual account/tenant erasure and real collector/copier SIGKILL cleanup.224 units,9 workspace types, lint and435 canonical operations pass. Current46/v5 signed restored application is running; no pass is inferred from the earlier45/v4 result.

O: actual local Compose/SQL/S3/OIDC/browser/process results and authored fixtures. R: preserved acceptance dependencies and source/actor/version/workflow rules. P: see current PROGRESS.md and task logs. V: native/model distribution admission, independent country/property examples, usable GPU (explicitly deferred), physical headset, human/parity and off-host/production acceptance remain unfinished. Missing HE-I06/K07/K08/A05-GPU evidence files now explicitly record unsupported/unverified limits. Splat WebXR is unsupported by the current adapter; structural VR software does not prove splat stereo. These gates do not justify stopping remaining software implementation or calling it accepted.

Runnable source gaps still include admitted reconstruction-stage integration, concrete disabled-provider execution integration, complete native distribution audit and current operations/release evidence. Keep those distinct from external hardware/data/human inputs.

# Digitization engine completion audit — 10 October 2026

The authoritative digitization ledger has 95 tasks: 53 accepted and 42 unfinished (38 in progress, 4 not started). The root marketplace/management ledger separately records 120 accepted tasks. Its completion does not establish digitization completion.

This count uses acceptance status, not the existence of files or the size of the codebase. Existing partial implementations and passing investigation tests are not full task acceptance. The supplied specifications and acceptance dependencies are preserved.

| Area | Unfinished | Source assessment |
| --- | ---: | --- |
| Infrastructure and GPU profiles (A) | 2 | CPU service is accepted; GPU profile and parent rollup remain unfinished. |
| Documents, facts and mapping (D) | 9 | Real confined native/OCR extraction and private persistence exist. Source review is provisional; production admission, country benchmarks, conflict workflow and full inventory mapping remain. |
| Assisted plan tracing (E) | 1 | Manual tracing, dimensions and structural rendering exist; private editable ink-line proposals have local evidence, with final assisted acceptance unfinished. |
| Reconstruction and splat training (H) | 10 | Real CPU reconstruction investigation exists. Admitted camera-solve integration, quality/connectivity, registration, GPU training/resume, validation, tiers and privacy review remain. |
| Public viewer and device validation (I) | 7 | Private structural/panorama/splat viewers, bounded scene reports and scoped keyboard/axe checks exist. Private assigned camera approval and current selected-viewpoint navigation pass authored software fixtures; physical device/WebXR and full public capability/accessibility acceptance remain. |
| Quality review and publication (J) | 5 | Private quality/metrics and independent immutable panorama publication/withdrawal pass actual software checks. Structural/splat review/public packages and ordered full acceptance remain. |
| Operations and release validation (K) | 7 | Account cancellation/purge/retention and real encrypted DB/object/runner recovery pass locally, including digest refusal and interrupted-upload/result/tombstone recovery; three CPU output paths now have actual dispatcher/worker SIGKILL recovery. Tenant-wide deletion and off-host/production admission, required real GPU/clean-CI/fault and R1–R4 demonstrations remain. |
| Inventory integration (R) | 1 | Reviewed unit proposals and panorama publication pass local scope/review tests; all artifact-type and ordered integration acceptance remain. |
| **Total** | **42** | **No whole-engine completion claim.** |

## Runnable next work

Private camera checkpoint: HE-I03 is in progress. Current scoped pending observations and transformed room/hole/height/duplicate/navigation-refusal checks have real SQL/S3 evidence,209 units and passing full lint/types/contracts. Final scene lane passes three actual SQL/S3 cases and all six desktop/mobile browser journeys, including camera save/reload/rate recovery, scoped axe and five-width overflow. All nine workspace types pass. Independent approved navigation remains required. See `evidence/digitization/tasks/HE-I03.md`.

Latest recovery checkpoint: version2 signed proof now requires all42 engine/dispatch/idempotency tables; legacy version1 coverage remains compatible and limited. `recovery-expanded-proof-real-restore.log` passes complete table reconciliation, signed scene-registration-digest drift refusal, real object/runner bytes, interrupted reupload and tombstone fencing. All208 units/64files and full lint/boundaries pass. Current normal ledger validation passes; release validation still refuses42 unfinished tasks and the existing root gates. Restored application workflow and off-host recovery remain required.

Latest inventory checkpoint: the final nine-lane CPU software composite plus retention passes (`unit-application-final-software-suite.log`). Existing published-listing fact application now has a complete current generic native-source operator-to-independent-review path, including canonical community search, pending/replay/conflict gates, private source exclusion and two-mandate exact price preservation. Final search-specific checks pass11 PostgreSQL policies/events and2 desktop/mobile journeys (`unit-application-final-search-browser.log`). All206 units,9 workspace types, lint and410 typed contracts pass; seven fixture provenance records are retained. HE-D10/R07 remain in progress because all artifact types, representative acceptance and ordered prerequisites remain unfinished.

Latest crash checkpoint: `evidence/digitization/validation/worker-crash-output-matrix.log` passes three CPU output cases, each with real dispatcher/worker SIGKILL, stable Redis replay and original execution/fence/attempt reuse. Private checksums, pending native facts, foreign scope/signature refusal and no duplicate results/public package are asserted. HE-K05/K04 remain in progress; expired-lease GPU and full output/release acceptance are absent. Targeted strict TypeScript, lint, boundaries and shell syntax pass; the final expanded software composite passes all eight workflow lanes and four account-retention checks (`worker-crash-software-suite.log`). Six fixture provenance records and the negative rights/path/archive-pin unit checks pass.

Previous verified checkpoint: `evidence/digitization/validation/scene-privacy-fault-software-suite.log` passes the expanded seven local workflow lanes plus account-retention regression. Full units:206/64files; all9 sequential types, lint and409 contracts pass;160 database model schemas regenerated. Scene reports identify Docker Chromium/SwiftShader/mobile emulation; acceptance remains53/95. `scene-privacy-signed-recovery.log` reconciles19 table digests including private scene declarations and verifies signed DB/object/runner recovery. See the operations runbook for the remaining restored-application/off-host gap and the tested-input/device matrix for limits.

1. Finish dependency/model admission for actual OCR; complete normalization and generic extraction acceptance. Preserve unknown fields and source-linked exact decimals.
2. Implement disabled country profile contracts and benchmark tooling; enable each family only with its required independent authorized benchmark. The specification permits provisional generic source review before final HE-D09 acceptance.
3. Complete conflict resolution, source review and explicit inventory mapping through the existing reviewed inventory ports. Private evidence must remain scoped to its author/mandate.
4. Complete admitted reconstruction integration and downstream camera/scene quality and training work; GPU execution cannot be replaced by CPU reconstruction or synthetic output.
5. Assemble independently approved public packages, viewer capabilities and revocation, then run the full isolation/crash/publication/device/recovery acceptance suite.

## External acceptance inputs

- Working NVIDIA driver/runtime and suitable GPU resources: the fresh local `nvidia-smi --query-gpu=name,memory.total --format=csv,noheader` probe exits 9. See `evidence/digitization/engine-completion-gpu-check.log`.
- Supported physical headset/browser/controllers and real per-eye/stereo/refresh/lifecycle checks. Synthetic lifecycle tests cannot supply this evidence.
- Authorized, independently labeled UAE and Algerian family documents (at least ten independent examples per enabled family under the specification), plus representative property capture inputs.
- OCR/native/model distribution admission and resolution of the documented COLMAP licensing conflict. Investigation images remain disabled for deployment.

These inputs do not block all remaining software work. No unfinished task is attributed solely to missing hardware.

## Current implementation evidence

The new fact review API uses current agency/target/source scope, workspace/input/candidate versions, workflow state and actual source-byte preflight. It appends decisions while preserving original candidates, presents the original quoted page crop, keeps competing values visible and never mutates inventory or publication. The reviewer records an explicit reason. Its final acceptance remains dependent on HE-D08 and country profile contracts.

The final review checks pass 3 real OCR/API/database/storage journeys, 2 actual desktop/mobile browser journeys and 179 unit tests in 55 files. Lint, types, canonical contracts and task validation pass; release validation exits 1 and reports all 42 unfinished digitization tasks.

Actual commands and results are recorded in `evidence/digitization/tasks/HE-D09.md` and the linked logs. The release validator must continue to fail the unfinished ledger.

Latest private registration checkpoint (P): all ten CPU workflow lanes plus account retention pass (`registration-review-software-suite-corrected.log`), including actual concurrent request replay, changed-geometry refusal, independent assigned camera approval and obsolete-navigation refusal in both desktop/mobile journeys. All211 units/65files,9 workspace types, strict fixture types, lint/boundaries and417 canonical operations pass. Signed42-table DB/object/runner recovery passes (`registration-review-signed-recovery.log`). New local full-application drill implementation copies and hashes fixture bucket objects into a stopped owned storage clone and preserves native database login role hashes; actual application boot/workflow verification is running and is not yet claimed passed. Its startup configuration failures and owned cleanup are retained in separate logs. No whole-task or production/device acceptance is inferred.

## O

Authored English/French/Arabic document pixels and actual stored source/runner/database receipts. Existing licensed reconstruction benchmark is not a customer property benchmark.

## R

Preserved SPECIFICATION.html and docs/digitization/specification.md, authoritative task prerequisites, decimal-string and source-evidence requirements.

## P

Actual local Docker Compose tests and checked-in implementation/evidence paths; counts derive from the authoritative ledgers.

## V

No production OCR/model/distribution admission, independent country/customer accuracy, physical GPU/headset, human/parity approval, public package or complete R1–R4 release is inferred.


## Software continuation — 10 October 2026 (P)

Implemented disabled UAE/Algerian family preparation and offline benchmark reporting, a disabled structured suggestion adapter, exact-decimal conflict safeguards at selection and independent review, editable private source ink-line suggestions, and a confirmed intake-to-draft API/UI through the existing inventory creation port. Source grants/targets stay attached to the original intake; required missing unit facts block creation and canonical city/community selection is explicit. SQL195–197 are applied in development and isolated integration. Generated153 model schemas and392 typed operations.

Reconstruction now verifies separate camera-group database identities, proposes bounded temporal/cross-clip pairs, parses actual sparse camera/track connectivity and errors, tries at most one broader matching pass under the original deadline, and produces actionable recapture output. Actual licensed16-view single-group solve:16 registered cameras,3292 sparse points, median reprojection0.5938814119985296 pixels, one connected component. Authored grouping of those licensed pixels into two groups is explicitly not a physical lens-switch acceptance fixture. Original parser and blank-matcher failures are retained and corrected. No GPU, metric scale, geometric room coverage, country benchmark eligibility or production model/license admission is claimed.

Validation:183 TypeScript unit tests;120 processing tests;13 PostgreSQL intake/review policy checks;3 actual source-pixel proposal checks;2 desktop/mobile ink-suggestion save/edit/reload journeys;5 actual confined English/French/Arabic OCR/database/storage cases;2 desktop/mobile fact correction, canonical geography and private inventory-draft journeys. All9 workspace types, lint, generated contracts and normal task validation pass. Actual logs: `evidence/digitization/software-continuation-all-unit-tests.log`, `software-continuation-all-cpu-tests.log`, `intake-draft-policy-tests.log`, `assisted-lines-final-real-api-browser-journeys.log`, `intake-draft-real-ocr-browser-journeys.log`, `intake-draft-all-typecheck.log`, `intake-draft-final-lint.log`, `intake-draft-contract-check.log`.

The independent engine remains **53/95 accepted**, **42 unfinished** (17 in progress, 25 todo). Nine previously todo tasks now have in-progress implementation; prerequisites and full task acceptance still prevent marking them done. Release validation intentionally rejects unfinished tasks. All42 are not classified as external blockers: substantial GPU coordinator/training/export/viewer/publication/operations software still needs implementation, alongside missing authorized representative datasets, working NVIDIA runtime/headset and production dependency admission. User input for available dataset paths and hardware hosts has been requested while implementation continues.

O: actual checkout, authored OCR/scanned-pixel fixtures and licensed TUM views, with original failures retained. R: supplied specification/prerequisites, actor/scope/version/workflow guards, private evidence, exact decimal strings and exact acceptance. P: implemented software and observed local test/CPU reconstruction results above. V: representative country/property inputs, production OCR/COLMAP admission, real GPU/headset and downstream unfinished acceptance remain unresolved; no visual parity or release approval invented.

Current unfinished tasks:

- HE-A05: Add CPU/GPU profiles to current Compose/setup and runner network policies (in_progress)
- HE-D02: Add real PaddleOCR worker with locale profiles (in_progress)
- HE-D03: Implement normalization for decimals, units, IDs and calendars (in_progress)
- HE-D04: Implement generic anchored extraction with abstention (in_progress)
- HE-D05: Add UAE family profile and benchmark report (in_progress)
- HE-D06: Add Algerian family profile and benchmark report (in_progress)
- HE-D07: Add optional structured model provider behind disabled-by-default config (in_progress)
- HE-D08: Preserve conflicts and decision history (in_progress)
- HE-D09: Build source-linked fact review UI (in_progress)
- HE-D10: Add explicit fact-to-draft mapping, private intake, canonical geography resolution and pending-revision apply (in_progress)
- HE-E08: Add assisted line/label proposals (in_progress)
- HE-H01: Build pinned COLMAP CPU/GPU image and smoke CLI wrapper (in_progress)
- HE-H02: Add camera grouping and primary matching profile (in_progress)
- HE-H03: Export quality/connectivity report (in_progress)
- HE-H04: Add one bounded matching fallback and recapture output (in_progress)
- HE-H05: Add metric scale and scene/plan registration records (in_progress)
- HE-H06: Build pinned gsplat training wrapper and checkpointing (in_progress)
- HE-H07: Add resume, time cap and reduced-memory fallback (in_progress)
- HE-H08: Add held-out render report and scene sanity validation (in_progress)
- HE-H09: Export compatible splat tiers/manifests (in_progress)
- HE-H10: Enforce scene privacy review and incomplete-room labels (in_progress)
- HE-I01: Extend existing PropertyMedia lazy tabs; add independent scene3dAvailable capability (in_progress)
- HE-I02: Integrate splat adapter, bounds/reset and resource cleanup (in_progress)
- HE-I03: Add approved camera anchors and optional floor-map links (todo)
- HE-I04: Add tier selection and measured performance report (in_progress)
- HE-I05: Implement WebXR capability/gesture/session lifecycle (in_progress)
- HE-I06: Verify splat WebXR stereo and teleport if supported (todo)
- HE-I07: Accessibility and supported-browser check (in_progress)
- HE-J01: Build quality summary with compatible-area comparisons (in_progress)
- HE-J02: Extend independent moderator/admin review and immutable output dependencies (in_progress)
- HE-J03: Assemble public allowlisted manifest and atomic package (in_progress)
- HE-J04: Integrate changeListingState, pending listing/media revisions and reviewed projections (in_progress)
- HE-J05: Revoke and version public packages (in_progress)
- HE-K01: Add metrics/redacted logs and operations dashboard (in_progress)
- HE-K03: Add tenant/account deletion and cancellation propagation (in_progress)
- HE-K04: Add required CI lanes and fixture licensing manifest (in_progress)
- HE-K05: Run upload, two-tenant, worker-crash and stale-approval acceptance (in_progress)
- HE-K06: Write production configs, backup and rollback runbooks (in_progress)
- HE-K07: Run reference workload and publish supported-input/device matrix (todo)
- HE-K08: Demonstrate full R1–R4 engine and known limitations (todo)
- HE-R07: Extend reviewed inventory application port for extracted unit/location/facts and artifact publishing (in_progress)
- HE-A05-GPU: Add and verify the pinned optional isolated GPU processing profile on supported hardware (todo)


## User clarification: generic documents and host resources — 10 October 2026

The user specified using the local host and extracting facts from documents without requiring a particular country template; unavailable facts must remain unfilled. Generic extraction now has explicit v3 evidence-backed English/French/Arabic text fields (country/region/city/district/address/property type/tenure/owner/boundary), string identifiers preserving leading zeros, and explicit standalone count phrases in flexible line/semicolon layouts. Original quote/page/crop and pending review remain attached. Blank/unknown/n/a fields and unlabeled numbers do not generate candidates. The API independently rechecks each normalized value against actual retained native/OCR text and refuses version substitution or invented text. No document author claim creates owner authority or canonical geography automatically.

Current host inventory: Intel i9-10885H,16 logical CPU threads,62 GiB RAM, and NVIDIA GTX1650Ti Mobile PCI device. The running kernel is7.0.0-34-generic and `modinfo nvidia` reports no module; `nvidia-smi` cannot communicate with a driver. CPU workers run on the existing host through bounded Compose services. This is a missing usable CUDA driver/runtime, not an absent physical GPU. No kernel/driver installation, hardware device acceptance or GPU processing result is claimed.

No special document template or representative country upload is required for the generic extraction/review/private draft path. Representative country/property fixtures remain acceptance inputs for disabled specialized profiles and physical reconstruction benchmarks only. Mandatory canonical unit fields remain blank in the intake until explicitly supplied; creating a canonical unit without them would require invented values and is blocked.

O: user's latest clarification, actual host CPU/RAM/PCI/driver probes and retained actual document text. R: format-independent supported-document extraction with unknowns omitted, exact source evidence and host resource limits. P: generic v3 implementation, actual native-PDF parsing and strict API validation. V: current CUDA driver unavailable; GPU/headset, specialized benchmark/admission and downstream software acceptance remain pending.


## Generic path final verification — 10 October 2026 (P)

Final broader checks:184 TypeScript units across57 files (`generic-format-final-all-unit-tests.log`),125 processing checks (`generic-format-final-all-cpu-tests.log`), all9 workspace typechecks, lint and392-operation contract check. The final unknown-identifier hardening additionally passes31 source/extraction checks (`generic-unknown-fields-final-tests.log`) and13 native/v3 API projection checks (`generic-unknown-final-api-tests.log`). Actual arbitrary-layout native PDF keeps City Dubai, Property type Apartment, Plot00123 and explicit2bedrooms while omitting unavailable fields; original undersized authored PDF test failure is retained and corrected with a source page wide enough for its printed text. `generic-format-real-ocr-browser-journeys.log` passes5 actual confined scanned-PDF OCR cases and2 desktop/mobile review/correction/conflict resolution/canonical geography/private draft journeys. Test-only pinned OCR image uses a read-only current-source mount; this is explicitly not production admission.

The final separate-camera CPU run records camera groups1 and2,16 registered cameras,2769 points and median reprojection0.5882330781237699 pixels, primary advisory passed without fallback (`colmap-two-groups-final-real-solve.log`). Earlier poor-registration bounded-fallback evidence is retained; no deterministic reconstruction parity is claimed. Source code, private scope/workflow checks and release gates remain authoritative. Accepted task count remains53/95,42 unfinished (17in_progress,25todo); substantial downstream software remains as well as unusable current CUDA driver/hardware acceptance and production admission.

O: actual host/resource/source/CPU/OCR/browser observations. R: user's generic-document/unknowns instruction and preserved specification acceptance. P: above retained results. V: remaining42 exact task acceptances, production model/dependency admission, CUDA/headset and downstream release software/validation remain pending.


## Operator processing continuation — 10 October 2026

53/95 tasks accepted; 19 in progress, 23 todo, 42 unfinished. Generic native-PDF v3 profiles now extract available source-anchored metadata/counts on the normal CPU path; original v1 profiles remain distinct. Source-linked pending candidates pass18 actual CPU execution checks,14 API projection checks and5 real scoped API/SQL/S3/worker cases. Operator upload/process/status controls use server-prepared scope/profile/fingerprints and the existing durable outbox/BullMQ coordinator. Both actual desktop/mobile journeys upload an arbitrary-layout authored PDF and see4 pending source-linked facts and original crops, without invented absent fields. The exact CPU development image haven-processing-cpu:1.0.0-cpu-v3 builds successfully with the default local builder and starts on the host; two Docker Hub metadata TLS failures with the unrelated selected builder are retained.

Private quality summary and safe error visibility are in progress (HE-J01/HE-K01). Three exact-decimal/basis comparison tests pass. Terminal failure descendant skipping and graph finalization are under real regression testing. Wider final checks and downstream scene/review/publication work remain outstanding. Evidence: operator-processing-real-browser-journeys.log, operator-processing-real-port-tests.log, native-v3-cpu-tests.log, native-v3-api-unit-tests.log, operator-processing-cpu-image-build-local-builder.log. O: authored sources/test identities. R: preserved specification/API ownership/current authorization/unknown-fields abstention. P: actual confined CPU and real queue/database/storage/browser execution. V: no representative country accuracy, production OCR/native model admission, usable NVIDIA driver, physical headset acceptance, production/release or complete-engine claim.


## Software work with GPU validation deferred — 10 October 2026

The user explicitly answered “Continue software work; GPU validation must wait.” No host driver changes or repeated hardware approval request are required. Independent engine count remains53/95 accepted,42 unfinished;23 in progress and19 todo. HE-H06–H09 now have implementation in progress, with no acceptance/dependency bypass.

Normal native-PDF upload/bind/queue/CPU/source-linked fact review and private quality summary pass both final desktop/mobile journeys (operator-processing-final-quality-browser.log). Five actual quality/native API cases, four actual terminal-failure worker cases and188 TypeScript units pass. Compiled API/contracts and the exact versioned CPU image are running on the development host. Private pending candidates and absent-field abstention remain enforced.

Added bounded training input validation, actual COLMAP image undistortion/model conversion, separated timestamp holdouts excluding adjacent frames, a private fixed-density gsplat wrapper with optimizer/RNG checkpoints, cumulative budgets, one reduced-resolution OOM fallback, external cancellation/time-cap supervision, held-out render reporting, strict scene validation and measured private splat tiers. The real licensed CPU capture produces sixteen undistorted calibrated views and a nonempty connected sparse model (training-input-real-cpu-preparation-corrected.log); original missing-model-path failure is retained. Actual CPU fixtures/process checks pass29 combined source/export checks and29 supervision/source/export checks; all152 CPU checks passed before supervision was added. Exact source/proposed runtime pins are in gsplat-investigation-profile.json, enabledfalse. No CUDA training result or production native dependency admission is claimed.

O: actual host/service logs, authored document/binary fixtures and licensed TUM captures. R: preserved specification, actor/scope/version/workflow guards, unknown information omitted and exact acceptance. P: above observed local Compose results and implemented software. V: GPU execution is deferred by the user; real checkpoint/render/viewer/device acceptance, production dependency admission and remaining downstream software remain incomplete.


## Registration and private scene preview continuation — 10 October 2026

Engine53/95 accepted,42 unfinished (25in_progress,17todo). HE-H05 andHE-I02 now have software in progress. Migration198 adds immutable pending registration estimates backed by exact NUMERIC scale strings, with current actor/source/scene/geometry/version checks. Non-collinear anchors and compatible observations are mandatory; navigation and metric measurement flags remainfalse. Three meaningful transform tests and five real native source/registration scope cases pass; the initial ambiguous artifact SQL query failure is retained and corrected.

Added shared splat32 codec, lazy bounded Gaussian renderer and private scene-tier API/ops panel. Actual source/grant/tenant/revision checks and exact stored bytes precede any preview; resource release covers close and setup failure. Two binary codec tests pass and the authored27-splat PLY actually exports through the CPU module; browser validation is ongoing. This fixture is explicitly not trained reconstruction or a performance benchmark. All155 CPU checks pass, including actual process supervision. GPU validation remains deferred at the user’s explicit instruction. O: authored fixtures and observed CPU/API/SQL/S3 checks. R: preserved scope/versions/privacy and exact acceptance. P: implemented and tested portions above. V: scene generation/production dependency admission, independent registration/public review, viewer/device final acceptance and remaining engine software are incomplete.


## Reviewed publication and measured outcomes continuation — 10 October 2026

53/95 engine tasks accepted;42 unfinished (30in_progress,12todo). GPU validation remains deferred by the user's explicit answer. All software work continues; no approval or hardware action is inferred.

Both actual desktop/mobile private scene previews pass real OIDC/API/SQL/S3/export/renderer checks, including GPU buffer cleanup (scene-preview-real-api-browser-corrected.log). The27 authored splats are software fixtures, not reconstructed captures or measured device performance.193 TypeScript units and155 CPU tests pass.

Observed fenced collection metrics pass five real source and four real failure cases. Times are database-clock-derived exact NUMERIC decimal strings with explicit lease-to-result basis; coded errors are redacted. Unknown facts remain omitted.

Reviewed panorama publication now passes a real author proposal, assigned independent inventory approval, public metadata/content, excluded-capture isolation, private-field stripping, preserved approved snapshot after a new tour edit, and withdrawal blocking all new requests (publication-corrected-real-port-tests.log). Initial nullable-heading contract failure is retained and corrected without inventing a heading. Operator/public viewer browser checks and final scope hardening checks are ongoing. Structural/splat publication review, full engine deletion/operations and ordered release acceptances remain incomplete; ledger states reflect work in progress.

O: actual service logs and authored source/binary/capture fixtures with synthetic CI review attestations. R: preserved specification, owning inventory workflow, current actor/source/version checks and exact acceptance. P: above observed Compose results. V: no human/parity approval, production native/model admission, real GPU/headset acceptance, complete engine or release pass.


## Scene inspection continuation — 10 October 2026

HE-H10 now has immutable private author inspection declarations tied to exact current tier version/checksum, source input revision and plan revision. Each plan room requires explicit covered/partial/excluded/unknown coverage; without a plan coverage remains unknown. Declaration status cannot grant approval/publication. Ops uses generated session SDK routes and shows pending review plus incomplete-room labels. Signed recovery includes this new table. Independent actual-scene render/privacy review, training lineage admission and public reconstructed package integration remain unfinished, as do HE-H09 prerequisites. The splat viewer also gains bounded arrow-key orbit and Escape close/focus return under HE-I07. Final test evidence and retained initial failures are in PROGRESS.md and evidence/digitization/tasks/HE-H10.md. Counts remain53/95 accepted,42unfinished (37in_progress,5todo). O: authored source/27-Gaussian exported software fixtures and real Compose observations. R: preserved specification/actor/scope/version/workflow/exact acceptance. P: implemented private declaration and keyboard software with retained verification. V: no real reconstructed-scene/human/GPU/headset/public package/production/whole-engine acceptance.


Publication fault continuation (P): Concurrent same-key submissions produce one proposal, competing new-key submissions refuse the pending inventory revision, concurrent independent decisions produce one package, and corrupted published derivative bytes are refused (`fault-concurrency-publication.log`, final `validation/software-tour-inventory.log`). K05 is in progress; actual process-level worker crash/all output-type fault acceptance and K04 remain unfinished. The expanded software composite, all206units,9types,lint/409contracts and signed19-table recovery pass. O: authored native capture pixels and actual DB/S3 transactions. R: independent inventory publication/scope/version/workflow. P: linked actual checks. V: no human/GPU/headset/production/whole-engine acceptance.


Recovery-backlog software checkpoint: real API429 pause/retry-budget and100 failed historical delivery fairness pass alongside all three CPU SIGKILL cases (`dispatcher-fairness-priority-final.log`). The updated ten-lane suite plus platform retention also passes (`dispatcher-priority-software-suite.log`);211 units/65files and full lint/import boundaries pass. Source-lock busy refusal is observed. Full restored API/OIDC upload succeeds, but final isolated browser collection/inventory/publication acceptance is pending after output-bind interference; none of these software results establishes physical GPU/headset, production/off-host or whole-engine acceptance. O: authored synthetic Compose observations. R: exact scope/version/approval/release gates. P: linked actual results. V: remaining task acceptance above.


Final restored-application evidence (P): `restored-application-source-locked-final.log` passes signed42-table DB/assets/interrupted-run restoration plus real recovered OIDC/private upload/CPU source facts/independent shared-unit inventory approval/panorama publication/public viewing/withdrawal.1143 objects/18416544 bytes verified;577503.916092ms observed locally, not production RTO. O: authored synthetic fixtures/CI review. R: exact source locks/scope/images/approval/cleanup. V: production/off-host/GPU/headset/full artifact-family/prerequisite acceptance remain unfinished. HE-K06 minimum verification passes; status remainsin_progress and count53/95.
