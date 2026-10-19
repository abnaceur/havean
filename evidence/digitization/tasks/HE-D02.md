# HE-D02 — real locale-aware PaddleOCR worker (accepted 12 October 2026)

## Acceptance
Add real PaddleOCR worker with locale profiles. Minimum: authorized Arabic/French/English fixtures produce nonempty source-linked tokens. HE-D01 is already accepted; the original acceptance and minimum test remain unchanged.

## Implementation
The separately admitted offline CPU release packages PaddleOCR3.3.3, PaddlePaddle3.2.2 and PaddleX3.3.13, 63 exact wheels, four immutable model revisions, 270 runtime files, 333 notices and 55 source/distribution archives. Exact Debian archive members and unmodified Intel libraries are traced; bundled NumPy/OpenCV libquadmath matches the upstream build ID and code/read-only/unwind sections, with its complete matching GCC source RPM and build recipe retained. Existing static media source, glibc patches and notices accompany the combined image. Acquisition and package verification are reproducible through Compose; no runtime model download is allowed.

Production document/image locale profiles require the exact release SHA in both API and runner. Source parsing/inference retains Landlock/seccomp isolation and bounded execution. API-owned scope/version/workflow checks persist private source pages, tokens, crops, pending facts and review decisions. Repeated/concurrent result collection returns the existing receipt after rechecking authority; the observed second-collector race is fixed. Contracts advertise the actual production OCR capability. The API production image includes the matching release manifest; the supplemental production Compose requires an immutable registry digest and protected keys.

Release SHA256: `337303a2325d8364e3a09c681c41b7a4a79a5469770649606cb687c1e7554cf2`. Tested final local image ID: `sha256:10f946939efd523188b68202fc9af3e6d25a7d2ff6d4c8cce2f41599911525f8`. This is a local image identifier, not a pushed registry digest. Build/activation instructions: `docs/runbooks/ocr-release.md`. Distribution review: `docs/digitization/OCR-PRODUCTION-REVIEW.md`.

## Tests
`./test-ocr-release.sh` passes four focused production-profile functional journeys on the final baked image: real English/French/Arabic raster-PDF recognition and one PNG source. All locale cases persist nonempty source-linked tokens and source/hash/page/crop evidence, retain pending review, and check applicable stale/tampered/replay boundaries. Evidence: `evidence/digitization/ocr-production-final-functional-journey.log`. One redundant JPEG case is intentionally skipped; prior bounded rotated-JPEG evidence remains available.

Four activation/refusal checks pass in `ocr-production-admission-corrected-functional.log`. Exact source/input bootstrap, build-time/runtime bundle verification, dependency gate, API types, focused lint and production Compose configuration pass in `ocr-production-source-bootstrap.log`, `ocr-production-input-bootstrap.log`, `ocr-production-complete-package-build.log`, `ocr-production-complete-image-validation.log`, `ocr-production-complete-bundle-gate.log`, `ocr-production-complete-license-gate.log`, `ocr-production-final-api-types.log`, `ocr-production-focused-lint.log`, `ocr-production-final-gate-lint.log` and `ocr-production-compose-config-corrected.log`. Generated contracts/OpenAPI pass in `ocr-production-contract-generation.log`. No broad suite or GPU test was run.

Earlier collection-race, obsolete test expectation, source-fetch/parser and configuration-fixture failures remain in their original logs. The intermediate image was unavailable for byte comparison (`ocr-production-runtime-equivalence.json`); the four final-image journeys above replace that unverified comparison.

## Limitations
Authored fixtures establish source-linked extraction, not representative property/country accuracy. Arabic/French imperfections stay reviewable; missing/conflicting evidence must abstain. Country automatic profiles and optional structured provider stay disabled. No deployment, external registry push, GPU/VR, physical-device performance, independent human/parity or full-engine release acceptance is claimed.

## Next dependency
HE-D03 normalization and HE-E08 assisted line/label proposals can use the accepted OCR prerequisite. Their own unchanged acceptance remains outstanding. Engine55/95 accepted,38 non-VR unfinished and2 VR paused; release continues refusing unfinished work.

## O
Self-authored authorized English/French/Arabic PDF/PNG fixtures; observed private Compose/API/SQL/S3/OCR output and exact publisher package/model/source bytes. No customer document or invented measurement.

## R
Original HE-D02 acceptance/minimum; preserved specification, actor/resource/version/workflow boundaries, exact distribution pins and mandatory review. User requested only minimum functional validation, kept GPU validation deferred and VR paused.

## P
The final offline production package and real source-linked locale/image journeys pass the exact checks above. Build/cache tooling, production activation contract, replay fix, generated capability contract and runbook are implemented. HE-D02 is accepted; earlier notes below are historical.

## V
The remaining38 non-VR tasks and2 paused VR tasks are not accepted by this OCR result. Production infrastructure/release and representative accuracy checks retain their own gates. No broader completion is inferred.

## Historical investigation evidence

## O
Self-authored synthetic English/French/Arabic images only. Arabic fixture uses the existing application SVG renderer for proper shaping. The user selected Abu Dhabi as the immediate geographic target; no customer documents, real capture dataset or working GPU/headset were supplied.

## R
A real locale-aware worker must produce nonempty source-linked tokens from authorized Arabic/French/English fixtures. Exact dependency/model/native licensing, bounded isolation and API-owned authority/result commits remain mandatory. Country profiles require independent labeled holdouts; model scores do not constitute accuracy or parity approval.

## P
Resolved 63 exact binary wheels; PyPI release hashes verified. Downloaded/reverified 20 official model files from four immutable publisher revisions. Offline CPU probes run PaddleOCR 3.3.3, PaddlePaddle 3.2.2 and PaddleX 3.3.13 with local model directories and all orientation/unwarping downloads disabled. Real output includes source SHA256, page, normalized polygon, raw recognized text and native score for all three languages. Models remain absent from the enabled runtime manifest. Scratch wheels/models/probe image are ignored and are not production dependencies.

## V
Passed real investigation: `evidence/digitization/ocr-three-locale-shaped-final-probe.log`. The Arabic quantity is misrecognized; this explicitly is not a correct quantity or a successful Abu Dhabi benchmark. French accents/superscript are also imperfect. Preserve raw output and require review/abstention; do not publish or auto-post it.
Exact candidate provenance: `evidence/digitization/ocr-investigation-pins.json`. Native-wheel/system-library distribution license audit, hardened worker integration and authenticated API token persistence remain pending. Therefore HE-D02 is not accepted. Earlier import/fixture failures remain in the OCR probe logs.


## Confined CPU implementation progress — 9 October 2026 (P)

New offline `property_processing.ocr_cpu` CLI verifies immutable model/native library hashes, requires a single trusted startup thread before confinement, opens source pixels after Landlock/seccomp, and emits actual source SHA/page/upright normalized polygons/native scores with mandatory review. API worker capability remains disabled. Current investigation uses unprivileged readonly/no-network Compose and bounded CPU/RAM/PIDs; startup libc/AVX probes run before input parsing, then exec/fork/socket/foreign reads deny, including newly created OCR threads.

`docker compose -f compose.yaml -f compose.ocr-investigation.yaml --profile ocr-investigation run --rm --no-deps ocr-confined-investigation` passes current Arabic source after eager trusted Paddle import. English/French explicit locale/source invocations also pass. Evidence: ocr-confined-eager-paddle-arabic-probe.log, ocr-confined-en-probe.log, ocr-confined-fr-probe.log and ocr-confined-three-locale-results.json. Model quantity is still wrong in Arabic; this is successful token extraction/isolation, not successful fact accuracy or an Abu Dhabi benchmark. French accent/superscript imperfections preserved.

`./test-processing.sh` passes94 tests including actual OCR thread foreign-file/socket/exec/fork denials and all existing media/decoder regressions; evidence/digitization/ocr-thread-kernel-processing-regression.log. Initial source-byte hash mismatch, missing GL/atomic dependencies and blocked lazy Paddle startup subprocess logs are retained. No permissions were relaxed for source parsing/inference.

63 actual wheels are SHA-reverified and native files/notices inventoried in ocr-wheel-native-notice-audit.json. Paddle's bundled Intel/OpenVINO/GNU components require specific distribution notice review; wrapper/model/worker cannot be declared enabled from the top-level Apache license alone. Exact source-linked API persistence and accepted country holdouts remain pending. O: self-authored shaped Arabic/English/French PNGs. R: fixed-empty forms and original engine architecture. P: actual confined CPU recognition and kernel tests. V: no human/parity/customer/GPU/production acceptance. HE-D02 remains in_progress.


## Native distribution tracing update (P)

Actual wheel commit d90d3ad913b1f13a258af5e8c035e389282ccbac matches the dereferenced v3.2.2 upstream tag. Captured actual-commit native build records in ocr-paddle-native-source-records.json. Official MKLML2019.0.5 archive validates its publisher checksum; actual text/rodata section hashes match the wheel's two libraries, while full binaries differ. Original Intel license and third-party-programs statement retained. Investigation now binds the unmodified original archive libraries, verifies actual runtime hashes before imports and passes confined Arabic recognition (ocr-confined-original-mkl-arabic-probe.log); this avoids treating a changed full binary as unmodified. Other bundled-native distribution checks and production enabling remain pending. Metadata-bearing PNGs are rejected (ocr-confined-metadata-denial.log).14 targeted license/pixel tests and final lint pass; no task acceptance/count change.


## Bundled source/notice progress — 10 October 2026 (P)

All four actual wheel LAPACK/BLAS/GNU runtime libraries are byte-identical to the pinned publisher archive; ocr-lapack-wheel-audit.json records actual full SHA256 values. That archive contains no license files, so it is not sufficient by itself for enabling distribution. The pinned OpenVINO source archive and nine retained licensing files (including runtime/oneDNN/oneTBB) are recorded in ocr-openvino-source-notice-audit.json. Actual NumPy bundled notices include the GNU runtime exception. These are retained source/notice evidence, not a blanket native-distribution approval. Production OCR stays disabled until every required native source/notice and worker/API integration check is complete. Original Arabic/French imperfections and required user review remain unchanged.

## Exact OCR native source notices — 10 October 2026 (P)

Retained the complete upstream notice files from checksum-verified immutable warp-ctc and warp-transducer source archives at the exact commits selected by the actual Paddle source CMake files. This includes warp-ctc's ModernGPU notice. The actual Paddle source tree also resolves oneDNN to commit `28d696724426b943e2f4a0e607f90cdc19aedaf6`; its complete source archive and two notices are checksum-bound. Records: `ocr-warp-source-notice-audit.json`, `ocr-onednn-source-link.json`, `ocr-onednn-source-notice-audit.json`.

The processing license gate now validates retained investigation notices, denies checksum tampering and escaping symlinks, and refuses to turn source-only research entries into enabled runtime dependencies. Twelve license tests plus three inventory-tour privacy checks pass (`ocr-source-notices-tour-projection-units.log`); targeted lint and the actual license gate pass. The runtime still reports eight pinned Python packages, zero enabled models and unavailable GPU. O: actual publisher source archives and self-authored adversarial gate fixtures. R: exact source/notice provenance and no implicit production approval. P: actual local hashes/Compose validation. V: these source records do not prove compiled-wheel build linkage or complete transitive distribution compliance; OCR worker persistence/integration and D02 acceptance remain unfinished.

Primary sources: [warp-ctc exact source license](https://raw.githubusercontent.com/baidu-research/warp-ctc/bdc2b4550453e0ef2d3b5190f9c6103a84eff184/LICENSE), [warp-transducer exact source license](https://raw.githubusercontent.com/PaddlePaddle/warp-transducer/7ea6bfe748779c245a0fcaa5dd9383826273eff2/LICENSE). No calibrated quantity accuracy or Abu Dhabi document benchmark is claimed.

## Durable supervised OCR worker progress — 10 October 2026 (P)

The actual execution store now supports three explicit test-only OCR investigation profiles. A fresh process supervises the confined reader with bounded output/diagnostics, a fifteen-second deadline, process-group cancellation and a fixed credential-free environment. Development/production cannot enable these profiles merely by setting the investigation flag. Locale/source/result bindings and symlink/path/budget checks fail closed; production readiness still reports OCR unavailable.

P: `docker compose -f compose.ocr-investigation.yaml run --rm --no-deps -e PROCESSING_DEPLOYMENT=test -e PROCESSING_ENABLE_OCR_INVESTIGATION=true ocr-confined-investigation python /opt/processing/ocr_worker_smoke.py` passes real English/French/Arabic byte transfer, HMAC request claims, nonempty source-linked tokens, persisted restart/replay, conflicting execution denial, changed-source rejection and actual deadline/cancellation supervision (`ocr-confined-durable-worker-probe.log`, `ocr-confined-durable-worker-report.json`). All 96 pinned CPU checks pass (`ocr-supervised-worker-processing-regression.log`); lint passes (`ocr-supervised-worker-lint.log`). This source/supervisor work is not a production enablement or Node API token-persistence claim.

Three unmodified Debian BLAS/LAPACK/GFortran runtime replacements are copied from the exact pinned dependency image and bound to actual package versions, package SHA256 and retained copyright notices (`ocr-debian-blas-native-audit.json`). All three real confined locale probes pass with these replacements (`ocr-confined-debian-blas-three-locale-results.json`). The original bundled compiler provenance is not invented. Source-only notice records remain disabled, and full distribution/runtime integration remains outstanding.

O: existing self-authored glyph images and synthetic scoped job requests. R: immutable scope/source/version boundaries, offline processing and empty missing fields. P: actual local private execution and persisted receipts. V: raw French accent/unit loss and Arabic quantity misrecognition remain review-required; no calibrated accuracy, country/customer benchmark, human/parity, GPU or production approval is claimed. HE-D02 remains in progress.

## Real multipage OCR continuation — 10 October 2026 (P)

The test-only worker now has three private document profiles in addition to the three image-page profiles. The document path verifies the exact PDF bytes in the isolated raster child, uses native glyphs first, runs real confined PaddleOCR only on pages requiring it, and binds every OCR token and candidate to the original PDF hash, raster hash and actual page number. One deadline covers rasterization and all inference; cancellation and late-output rejection remain mandatory. Profiles require both `PROCESSING_DEPLOYMENT=test` and the explicit investigation flag. Production readiness still reports OCR unavailable.

The actual two-page self-authored raster PDF yields two `123.45` decimal-string proposals with distinct page1/page2 source crops, the original source asset and durable/restarted receipt. Arabic corruption and French accent loss remain raw review-required tokens; unsupported quantities are omitted. New anchored-v2 extraction proposes only explicitly written integer room/parking counts; the existing anchored-v1 native profiles retain their prior behavior. The API independently validates the quoted value, crop and source/page lineage, supplies identity/revision itself and creates only pending private candidate objects. It has no persistence/publication side effect or new production OCR route.

Evidence: `ocr-confined-durable-api-projection-document.log` and its report; `ocr-document-v2-profile-full-regression.log` (108 CPU checks); `ocr-document-multilingual-api-projection-units.log` (7 API preparation guards, including the actual retained OCR result); `ocr-popsift-final-license-guards.log` (13 checks); `ocr-document-projections-compiled-api.log` (168 compiled files, no workspace source imports). Earlier missing-manifest capability-probe failure is retained alongside the corrected result.

O: authored glyph PNGs and an actual locally rendered two-page PDF, not a customer deed. R: fixed missing fields stay empty; raw scores are not calibrated accuracy. P: actual offline unprivileged kernel-confined inference, original page provenance, native-first decoding and Node preparation checks. V: production OCR distribution/model admission, database candidate/decision persistence, reviewer UI, country benchmarks, public packages and full HE-D02 acceptance remain pending.

## Clean standalone OCR investigation image — 10 October 2026 (P)

A tracked multi-stage recipe, separate63-wheel exact-hash lock and disabled build manifest now produce `haven-ocr-worker:3.3.3-clean-cpu-investigation-v1`. The final runtime bakes all4 pinned models and15 pinned native import libraries, verifies model/library bytes against the tracked record, uses unmodified MKL/OpenMP and Debian BLAS/LAPACK/Fortran replacements, and omits the old Paddle Fortran3/quadmath copies. Actual trilingual and original-page two-page durable OCR pass without host model/library mounts. The final filesystem absence and baseline OCR-unavailable capability are actually checked.

63 wheel providers now retain120 actual copyright/license/metadata notices under `docs/adr/licenses/ocr-wheel-bundle`, with exact wheel hashes and disabled notice metadata in `docs/adr/ocr-wheel-notices.json`. The BCE wheel lacks a standalone LICENSE, so its actual Apache2 metadata and source copyright header are retained separately; this does not invent an embedded LICENSE file. The gate rejects enablement, altered wheel/model/source pins and changed notice bytes. The attempted optional quadmath copy found no such dependency in the pinned Debian image; actual Debian Fortran5 has no quadmath DT_NEEDED entry, so no replacement was needed or added. That original failed discovery log is retained.

Evidence: `ocr-clean-worker-pinned-build.log`, `ocr-clean-worker-real-multipage-probe.log`, `ocr-clean-worker-native-capability-audit.log`, `ocr-clean-worker-tracked-recipe-build.log`, `ocr-clean-worker-tracked-recipe-real-probe.log`, `ocr-clean-worker-wheel-notice-license-guards.log`. Production runtime/model admission and persistent API review integration are still pending; all investigation flags remain test-only. O: actual immutable supplier artifacts, authored document pixels and local isolated executions. R: exact source provenance and empty missing fields. P: actual baked-model/library image and durable trilingual/multipage inference. V: no country/calibrated accuracy, production admission or HE-D02 completion claim.

## Native document source binding — 10 October 2026 (P)

Supported native-glyph v1 execution receipts now include the hash of the actual PDF bytes read inside the confined decoder and the explicit locale. The API has a separate strict native-result preparation boundary: it verifies current supplied source identity/hash/locale, sequential original pages, exact glyph quote/crop, unchanged normalized value and exact OCR-required page list. It preserves the v1 extractor identity, leading-zero IDs and server-owned pending review; native v1 cannot inject counts, approval, confidence or source identities. Scanned pages remain unresolved and empty rather than acquiring synthetic OCR. This preparation still has no persistence, publication or new route side effect.

108 real confined CPU regressions pass (`native-document-source-binding-cpu-regression.log`);11 native/OCR API projection guards pass (`native-document-api-projection-units.log`), including4 synthetic native-boundary cases. API types, full lint and compiled API build pass;175 unit checks/54 files and16 processing-license guards pass. The CPU test image now has the explicit version `haven-processing-tests-cpu:1.0.0-cpu-v1`; its checked local test recipe is distinguished from pulled deployment images and cannot admit production or an imported alias. Earlier implicit-tag gate failures are retained.

O: self-authored actual native PDFs and explicit synthetic API records. R: source lineage, decimal strings and fixed empty missing fields. P: actual isolated Compose decoding, API validation and build checks. V: no automatic fact approval, persisted decisions, country/customer benchmark, production OCR or task completion claim.

The fresh versioned CPU image also ran three actual native document execution receipts (`native-document-real-worker-report.json`): English ID00123, French unit area184.20, and a blank Arabic page with zero candidates/required OCR. Five API boundary checks pass, including replay of these real receipts (`native-document-real-worker-api-replay.log`). The blank Arabic page is an abstention fixture, not Arabic glyph/OCR accuracy evidence. No persistence or new runtime OCR admission is implied.

## Transactional native fact collection — 10 October 2026 (P)

The API collection port now persists validated native-glyph candidates and a checksum-bound private JSON receipt in the same transaction as stage completion. It checks actor/agency/current source grant, source bytes, workspace version, input revision, profile, execution and fence. Conditional storage creation and a second exact object hash check precede commit. Repeated and concurrent collection return the winning immutable receipt without duplicate candidates; even completed native receipts recheck actual source bytes. Candidate review stays pending, zero fields produce an empty candidate set, and scanned pages remain explicitly OCR-required. No fact decision or inventory/public mutation occurs.

The existing coordinator collection transport dispatches native fact stages through this port while retaining its exact execution/state/artifact-ID response contract. No new browser route or runtime OCR profile is enabled. Failure states retain the existing bounded stage/error handling. Source-linked OCR token persistence and crop review UI remain pending.

`native-fact-collector-final-concurrent-workflow.log` passes3 actual isolated native/API/SQL/S3 journeys for English/French/native-empty Arabic PDFs, including cold concurrent coordinator/direct collection, checksum/locale validation, exact decimals/leading zeros, foreign scope/fence denial, replay after stored-source tampering, input replacement and private pending receipts. The Arabic fixture is blank and validates abstention only. Final176 unit checks/54 files, full lint, API types and169 compiled API files pass; actual compiled collection imports also pass (`native-fact-collector-compiled-imports.log`). No new migration was needed.

O: self-authored actual PDFs and synthetic scoped CI actors. R: original architecture, current source/version/workflow checks and empty missing fields. P: actual confined decoder and transactional private native candidate collection. V: no reviewed facts, automatic inventory fill, production OCR/model admission, country/customer accuracy, human/parity or D02/D04 completion claim.

## Private persistence and provisional source review continuation — 10 October 2026 (P)

The real authored English/French/Arabic confined OCR receipts now commit actual original PDF/raster lineage, private page previews, raw tokens and pending source-linked candidates through the existing collection port. Final `./test-ocr-protocol.sh` passes 3 real API/SQL/S3 journeys; source tamper, replay, concurrent collection/decisions, foreign scope and stale revision/fence guards are exercised. Provisional generic review shows actual original quote/crop, appends reasoned decisions and preserves original candidates/history; 2 real desktop/mobile journeys pass. See HE-D09.md and fact-review-final-real-ocr-api.log/fact-review-stable-real-browser.log.

O: self-authored document pixels and CI actors. R: preserved ordered dependencies and empty/decimal-string rules. P: actual private Compose execution. V: no production OCR/model distribution, representative country/customer accuracy, human/parity/publication or full task acceptance; status remains in_progress.


## Immutable native/OCR page continuation — 11 October 2026 (P)

The actual native-then-OCR test reproduces a production schema problem: collection of the OCR receipt fails on document_pages_binding_id_page_key after native extraction has already persisted the same original pages (`native-before-ocr-page-key-reproduction.log`). Its English native extraction correctly abstains on authored raster pages and requires OCR for pages1/2; French/Arabic OCR cases pass. The earlier fixture used the wrong run identifier and fails before this boundary (`native-before-ocr-current-boundary.log`); it is retained separately.

Migration220, applied to both Compose databases, replaces the per-binding/page uniqueness with per-binding/page/preview-receipt uniqueness. Existing rows, private RLS and immutable guards remain. Fact review selects one deterministic OCR-preferred preview per source page, while both native and OCR receipts stay immutable. Plan labels select the latest completed OCR receipt deterministically. The quality summary counts distinct native-required pages and subtracts only completed OCR pages matching the same asset/source hash/page; facts remain pending and no inventory/public approval is inferred.

P: both migration applications,5 quality/decimal policy checks,8 recovery-policy checks, full lint/import boundaries and all9 workspace types pass in document-page-receipts logs. `native-before-ocr-immutable-quality-browser.log` is running; its real sequence/immutable receipt/current source/browser result is not yet accepted. The prior45-table full restore predates migration220 and assisted labels. Current-image/signed restore verification remains pending.

O: actual confined native/OCR execution on authored raster PDFs, actual local SQL/S3 and synthetic actors; no representative customer/country accuracy. R: preserved specifications, immutable lineage, API-owned rules, exact actor/resource/version/workflow, decimal strings and ordered prerequisites. V: this is an unfinished software verification checkpoint. Engine54/95 accepted,41 unfinished; root120/120 retained. OCR distribution, physical GPU/headset, human/parity, off-host/production gates remain unresolved. Continue runnable work.



## Native then OCR sequence verified — 11 October 2026 (P)

`native-before-ocr-immutable-rls-quality-browser.log` passes all5 actual confined OCR/SQL/S3 cases and both desktop/mobile OIDC journeys. The English fixture first runs real native extraction on authored raster pages, correctly abstains and reports two OCR-required pages, then collects actual OCR for the same original. Both immutable page receipts remain; duplicate insertion is refused, RLS updates affect zero rows and original tokens remain unchanged. Review selects exactly two OCR-preferred previews. The private quality summary falls from2 unresolved pages to0 while both extracted facts remain pending/reviewRequired and publiclyServed=false. Source tamper, stale/foreign scope and assisted label/edit/trace/save/reload/accessibility/width checks pass.

The first post-migration run passes4/5 cases but expects an exception for a row-level-policy denied update; it receives zero affected rows instead and remains retained in native-before-ocr-immutable-quality-browser.log. The corrected assertion verifies the actual denial and unchanged tokens. Migration220 is applied in both Compose databases. Five quality/decimal policy tests,8 recovery-policy tests, all9 workspace types and lint/import boundaries pass. The fresh immutable-image build and the actual copier SIGKILL/full five-minute cleanup test are running; no result or new restored-application pass is claimed yet.

O: authored raster PDF pixels and actual local native/OCR/SQL/S3/OIDC/browser observations with synthetic actors. R: immutable source lineage, API business rules, exact version/scope/workflow, decimal strings and ordered acceptance. V: OCR production distribution, representative country/property benchmarks, human/parity, trained GPU/headset and off-host/production gates remain unaccepted. Engine54/95 accepted,41 unfinished; release still refuses unfinished tasks. Continue runnable work.



## Current exact minimum verification — 11 October 2026 (P)

`./test-ocr-protocol.sh fact-review` exits0 in derived-output-current-native-ocr-review-browser.log:5 actual authored authorized English/French/Arabic/native-first OCR SQL/S3 cases and2 desktop/mobile accept/correct/source-crop/immutable-history journeys. Nonempty source-linked raw tokens and crop review satisfy the stated software minimum. This verification does not complete the task: production native/model distribution admission and ordered country/conflict prerequisites remain unfinished. No country accuracy or Arabic quantity correctness is inferred.

O: self-authored original pixels and actual confined execution, synthetic scoped actors. R: exact stated minimum, immutable source evidence and preserved acceptance order. V: status remains in_progress; engine54/95 accepted,41unfinished.


## Installed OCR native inventory — 11 October2026 (O/P)

`node scripts/audit-ocr-native.mjs` inspects the actual clean investigation image sha256:435ac3fe75be4f5c7309ac8d76f178176c98d58327a82569a149a2e052423ead through a readonly/no-network Compose service. It parses bounded ELF metadata without loading libraries, hashes installed files, attaches exact wheel/provider/version/archive hashes and compares installed wheel RECORD values.237 native files are attributed; no file lacks both a pinned wheel provider and a verified native replacement. The only4 changed installed wheel records are Paddle BLAS/LAPACK/OpenMP/MKL libraries, and all4 match their documented replacement pins.15 linked names outside the inventoried roots remain to be traced; this is not a missing-library verdict or complete build/distribution linkage.

Evidence: ocr-scoped-immutable-native-dependency-audit.json/log. The wrapper resolves and uses the observed immutable image ID and explicitly names its own Compose project. Earlier audit logs contain a Compose orphan warning from the inherited development project name; no original resource was removed.3 synthetic malformed/bounded ELF parser guards pass (ocr-native-audit-parser-corrected-guards.log); orchestration lint passes. The audit helper is included only in the CPU test image for those guards. The active16-lane API suite retains unchanged API/schema/profile/runtime images; no native distribution capability is enabled.

O: actual installed publisher binary bytes/metadata, separate synthetic parser fixtures and authored source process probes. R: exact hashes, source attribution, bounded offline audit and truthful O/R/P/V. P: observed native inventory and guards above. V: transitive system-library/build linkage, full redistribution/model admission and HE-D02 acceptance remain unfinished. Engine54/95 accepted,41unfinished. Current46/v5 restored application already passes; the16-lane composite remains running.



## OCR system-library archive linkage — 11 October2026 (O/P)

The immutable audit now recursively traces the actual installed ELF links into fixed system-library roots and reads installed package metadata. It finds13 system files. Three were copied by dpkg-deb extraction rather than registered as installed packages: GLib, GThread and GOMP. Their actual file hashes exactly match the data members of both checksum-pinned Debian archives (libglib2.0-0t64 version2.84.4-3~deb13u5 and libgomp1 version14.2.0-19). All13 discovered system files now have an observed package record; no registry metadata is invented for the extracted files.

`node scripts/audit-ocr-native.mjs` exits0 with237 site/replacement files plus13 system-library records in ocr-immutable-native-system-archive-link-audit.json/log. Three names remain unresolved in the fixed roots: libICE.so.6, libSM.so.6 and libXext.so.6, referenced by the OpenCV Qt platform plugin/XcbQpa library. The report describes static lookup rather than claiming those GUI paths were exercised or that OCR inference fails; prior actual confined trilingual inference is retained separately. Complete native build/distribution/model admission remains unfinished. Four synthetic ELF/ar bounds, termination, truncation and duplicate-member guards pass (ocr-native-system-archive-parser-guards.log). No production capability is enabled.

O: actual immutable image bytes, installed metadata and exact public Debian archive members; separate synthetic parser fixtures. R: source/provider/hash lineage, bounded readonly/no-network Compose and accurate O/R/P/V. V: unresolved GUI packaging/native distribution and full HE-D02 acceptance remain unaccepted. Engine54/95 accepted,41unfinished. All6 capture cases including actual copier SIGKILL pass in the current16-lane composite; its remaining lanes are still running. No hardware, country accuracy, human/parity or production acceptance is inferred.


## Local functional continuation — 12 October 2026 (O/R/P/V)

O: authored source pixels and actual local Compose services. R: original task acceptance, exact source/actor/revision/workflow and unknown-field abstention. P: local OCR is usable through API-owned document processing with the existing durable queue/worker, source-linked pending review and conditional operator action. PNG and EXIF-rotated JPEG persistence pass in `local-ocr-start-corrected-functional-validation.log`; the actual running queue journey passes in `local-ocr-queued-corrected-functional-journey.log`. Trilingual/multipage OCR passes in `ocr-no-gui-functional-smoke.log`. Disabled country profiles now also abstain from explicit unknown text; five focused checks pass in `country-unknown-functional-validation.log`. The changed contracts/API/ops types and focused lint pass. V: these supersede older statements that no local OCR persistence exists; production/native/model admission, country representative accuracy and unfinished task prerequisites remain unaccepted. Status remains in_progress.

## Bounded phone-photo OCR — 12 October 2026 (O/R/P/V)

O/P: PNG and an authored approximately 6-megapixel EXIF-rotated JPEG pass source-start, real OCR, source-linked persistence, orientation, private preview and replay checks in `local-ocr-bounded-phone-photo-functional-validation.log` (two functional cases). The first resize candidate kept only a 4-megapixel area cap; the model split the unit suffix into a separate token and correctly produced no ungrounded quantity. That failed expected-fact result is retained in `local-ocr-phone-photo-functional-validation.log`. The final local image profile additionally bounds the long edge to 1600 pixels and preserves normalized original-to-upright coordinates and the original source checksum. Both cases now produce the explicitly printed pending quantity. This is authored fixture evidence, not general phone-photo accuracy. R/V: production/model distribution, country/property and physical-device gates stay open; accepted count remains54/95.
