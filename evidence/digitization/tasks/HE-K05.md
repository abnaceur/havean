# HE-K05 — Isolation and fault acceptance

## Acceptance

Run upload, two-tenant, worker-crash and stale-approval acceptance. Minimum: fault injection produces no unauthorized exposure or duplicate public package. In progress; HE-K04 and full trained-scene/GPU-crash/release acceptance remain unfinished.

## Implementation

Extended the real native tour/inventory review lane with concurrent identical-idempotency publication deliveries, competing new-key proposals and independent approval transactions. Concurrent same-key requests return the same proposal; both new-key proposals refuse the already-pending inventory revision. Relational checks require exactly one pending listing revision, one engine publication proposal, one public package and one public listing version increment. Two simultaneous decisions produce one approval and one stale/conflicting decision. Actual S3 corruption of the published derivative is refused before serving content, and exact bytes are restored in finally cleanup. Existing checks cover author self-approval, foreign mandate private-source isolation, substituted source bytes, excluded node access, stale reviews after edits, preserved approved snapshot and withdrawal of new requests.

The software composite now runs this real tour-inventory fault lane in addition to native facts, worker failure-finalization, operator processing, scene preview, independent public-panorama browser review, account deletion and retention regressions. No fault test disables authorization or a release gate.

## Tests

`./test-runner-protocol.sh tour-inventory` passes one actual scoped native-capture/API/SQL/S3 review/publication test with all above fault and concurrency assertions. Evidence: `evidence/digitization/fault-concurrency-publication.log`. The final expanded `./test-digitization-software.sh` composite passes all seven workflow lanes plus account-retention regression (`evidence/digitization/validation/scene-privacy-fault-software-suite.log`). Final unit/type/lint/contracts checks pass as recorded in PROGRESS.md. Exact K05 acceptance remains unfinished.

## Limitations

The new fault coverage exercises real native panorama software with authored image pixels and synthetic CI attestations. It is not human projection/privacy review. Admitted GPU reconstruction/training crash recovery, cross-output independent scene review and clean remote HE-K04 evidence remain unfinished. Three CPU output paths now have process-level crash/restart evidence below. A function-level stale/refusal check cannot substitute for an interrupted worker process rehearsal. No exact K05 completion is claimed.

## Next dependency

Finish HE-K04 and the remaining GPU process-crash and all output-type fault matrix before K05 acceptance, then complete production/off-host/restored-application K06 and R1–R4 demonstration gates.

## O

Actual scoped native captures, isolated PostgreSQL transactions and S3 byte corruption; repository-authored pixels and CI actors/attestations.

## R

Preserved specification; independent inventory publication, actor/resource/version/workflow checks, no duplicate or half-written package, and exact acceptance dependencies.

## P

Passing actual concurrent native publication and corruption-refusal checks retained in the linked log; integrated composite lane.

## V

The three CPU process-crash paths below are verified locally; GPU/output matrix, human/parity/production/remote CI and full-engine acceptance remain unresolved.

## Worker process crash continuation — 10 October 2026

O: `tests/integration/digitization-worker-crash.test.ts` uses real separate Node dispatcher/worker processes, an isolated API process, a unique Redis queue, PostgreSQL workflow/receipts, scoped S3 inputs and the confined CPU runner. Inputs are authored English native PDF text, PNG plan pixels and ordinary 2:1 panorama candidate pixels. These are not representative property captures or human projection attestations.

R: Production `dispatchDigitizationEvents`, `createDigitizationProcessor`, signed internal API commands, runner source validation and normal processing creation/collection remain the execution path. No SQL lease/result/receipt state is forged. The child process hooks pause at actual side-effect boundaries; SIGKILL and its observed exit signal prove process death. Test-only BullMQ lock/stall timing is 1000ms; it does not change production queue policy.

P: The three-output local lane passes both crash boundaries per output (`evidence/digitization/validation/worker-crash-output-matrix.log`). A dispatcher is killed after enqueue but before SQL dispatch acknowledgement; stable-ID replay retains one queue job and stamps one delivery. The worker is killed after actual runner submission and before collection. The runner completes while SQL has no artifact. A fresh worker observes Redis stalled recovery, reuses the same execution/fence/attempt and commits one set of private/pending outputs. All recovered object sizes/checksums and available PNG preview bytes match; native fact candidates retain exact decimal `123.45` and pending review. Outbox/collection replays do not duplicate artifacts, facts, attempts, effects or stage-completed events. Foreign tenant commands return404, invalid coordinator signatures return401, and no public package exists. The software composite includes `worker-crash` and existing CI retains its `software-worker-crash.log`.

V: This tests restart within the live CPU lease/budget on the same database/object/runner store. It is not expired-lease GPU recovery, restored full application acceptance, clean remote CI, structural/splat publication or a human/property benchmark. Full K05 and prerequisite K04 remain in progress. Earlier statements that process-level crash evidence was wholly absent are superseded only for these three CPU output paths.

Final validation (P): `evidence/digitization/validation/worker-crash-software-suite.log` passes all eight actual workflow lanes plus four retention checks. The final `software-worker-crash.log` passes all three output cases. Targeted strict TypeScript/lint, fixture provenance/negative unit checks, boundaries and shell syntax pass. Normal ledger validation passes; release validation exits1 and reports all42 unfinished digitization tasks. No full K05 acceptance is inferred (V).


## Recovery backlog continuation — 10 October 2026

O: the full restored local application booted with a cloned synthetic database containing7,472 pending digitization events. Uploads succeeded while processing remained queued in the initial FIFO replay. This is synthetic software backlog, not a production workload measurement.

R: failed jobs retain bounded attempts and pending audit records; actor/source/version/workflow checks remain in the API. Replay must reach later events and respect the existing API write limit.

P: the dispatcher now uses bounded keyset paging (at most1,000 examined and100 enqueued per pass), stable job IDs, a per-queue cursor with wraparound, and current/replay priorities. API429 responses pause the worker for61seconds without consuming a delivery retry; no API limit is weakened. The actual API/PostgreSQL/Redis fairness case passes in `dispatcher-fairness-priority-final.log`:100 unsupported historical jobs remain failed with one failed attempt and pending outbox audit, a later valid event completes with exactly one scoped receipt, and replay/current job priorities are checked. The test deliberately exhausts the real API write limit. Earlier rate-window and incorrect unscoped RLS-count fixture failures are retained. Full lint/import boundaries pass (`dispatcher-priority-final-lint.log`);211 unit tests/65files pass (`dispatcher-recovery-units.log`).

P: all three existing plan/facts/panorama SIGKILL cases also pass in the same `dispatcher-fairness-priority-final.log` (four tests total); prioritized queue assertions retain one durable delivery. V: the full restored application retry is running. No full HE-K05 acceptance, production recovery, physical GPU workload or ordered prerequisite completion is inferred.

P: the complete updated ten-lane software suite and platform account-retention regressions pass in `dispatcher-priority-software-suite.log` (per-lane details in `evidence/digitization/validation/software-*.log`). V: this verifies the authored software paths and faults, not a physical reconstruction, headset or all public artifact types.

## Current capture-aware restored application pass — 11 October 2026 (P)

`node scripts/recovery/test-processing.mjs --application` exits0 in `capture-source-packaged-current-45-table-restored-application.log`. All45 exact v4 table proofs reconcile; deliberate signed workflow drift and ciphertext tamper are refused.2408 source objects/117483476 bytes (aggregate2906553247fd339b713e2183b9858cdc13290df56adbbf5575f6c11b747ea820) are copied/verified with sourceMutated=false. Restored OIDC/private source upload, actual CPU extraction/source-linked review, independent shared-unit/location approval, panorama and both structural/SPLAT publication/rendering/withdrawal pass. The real private multipart capture, exact scan/binding, clip validation and frame extraction also pass. Completed result/preview, interrupted upload, source-preview SHA, deletion tombstone, stale-request and duplicate-execution guards pass. Observed local elapsed474589.517865ms includes clone/recovery/application verification and excludes final cleanup; it is not production RTO. Owned cleanup exits0; original API/storage/identity remain healthy.

All5 required screenshots are retained: recovery-capture-source-desktop.png, recovery-unit-application-desktop.png, recovery-published-tour-desktop.png, recovery-published-model-structural-desktop.png and recovery-published-model-splat-desktop.png. Current5 immutable source-only images/ten locked dependency volumes build without registry download; the readonly/no-network/unprivileged immutable-browser fixture byte/header probe passes. The initial absent fixture,503, old queue assertion and historical discovery failures remain retained. Logical fixture statistics are refreshed only on the owned clone. Full lint/import boundaries, relevant worker/ops types,8 recovery-policy checks,5 actual crash/fairness cases and7 wider scoped protocol cases pass. The complete15-lane plus retention suite passed before the subsequent discovery/loading/packaging corrections; those corrections have scoped and full restored-application evidence, not an invented second composite run.

O: authored MP4 with three frames/27 Gaussians, synthetic local accounts and actual Compose SQL/S3/OIDC/CPU/browser ports. R: original specification, API rules, source privacy, decimal strings, actor/resource/version/workflow and exact acceptance/prerequisites. P: actual current local restore and scoped evidence above. V: assisted text-label software and external native-distribution/reference/GPU/headset/device/human/off-host/production gates remain unaccepted. Engine53/95 accepted,42 unfinished; no whole-engine/release completion is claimed. Continue runnable work.



## Actual copier SIGKILL verified — 11 October 2026 (P)

`capture-source-actual-copier-sigkill-cleanup.log` passes the upgraded interrupted-copy case: the real API copier runs in an owned test process, successfully writes its exact conditional private object, then receives actual SIGKILL before admission. A test-only SDK boundary intercepts the successful write; no production fault hook is introduced. The durable reservation remains quarantined/unscanned with no admission event. Tenant deletion waits through the unchanged real five-minute writer lease; afterward original/copy HEADs return404, pending jobs reach0 and late admission is refused. Only this case runs (five unrelated cases are skipped); prior six-case/desktop/mobile capture evidence remains separately retained. Observed local case301520ms is not a production performance/RTO measurement.

The readonly integration observation confirms the actual copy marker, deletion_requested/unscanned reservation, live lease and zero admission events (capture-copier-container-private-reservation.log). Its initial standalone diagnostic omitted HAVEN_CONTAINER_TESTS and failed before connecting; the successful corrected diagnostic and initial failure are separate. An initial zero-marker probe inspected the development container, not the integration fault process; it is not negative integration evidence.

P:224 units/72files, all9 workspace types, full lint/import boundaries,5 quality/decimal tests,8 recovery-policy tests and strict copier/OCR integration-fixture types pass. Earlier fixture type-resolution/SDK-union/partial-request-cast errors are retained; document-page-copier-fixture-types-verified.log passes. Five immutable local source-only runtime/browser images build with ten locked dependency volumes, matching lock SHA and no registry download (document-page-current-immutable-recovery-images.log). The image snapshot predates the final integration-test-only type annotation; runtime API/worker/browser source and migration220 are current. The signed45-table restored application drill is running in document-page-220-current-restored-application.log; it has no accepted result yet. Runtime/schema are frozen for the drill.

O: authored actual triframe MP4, actual conditional S3 write/process kill/SQL deletion/full lease and synthetic local tenant actors. R: bounded writers, durable lineage, exact authority/version/workflow, preserved original projects and honest O/R/P/V. V: only the scoped kill/cleanup software evidence is accepted; HE-K03/K05 keep their unfinished ordered prerequisites. OCR distribution, representative property/country data, trained GPU/headset, human/parity and off-host/production gates remain unfinished. Engine54/95 accepted,41 unfinished; root120/120 preserved. Continue runnable work, including auditing derived-object writes before final collection commit.



## Migration220 restored application passed — 11 October 2026 (P)

`node scripts/recovery/test-processing.mjs --application` exits0 in document-page-220-current-restored-application.log. All45 exact v4 table proofs reconcile and deliberate signed workflow drift/tamper are refused.2474 original objects/118026978 bytes are copied/verified with aggregate cf313db038f7f6d46f52c4d5079a0e8aff1eb1997ab3827b9c9f316ca85f45a8 and sourceMutated=false. The restored current runtime passes actual OIDC upload/CPU collection/source-linked review, independent shared-unit/canonical-location approval, panorama and both structural/SPLAT publication/public rendering/withdrawal. Private multipart capture, scan/bind, clip validation and frame extraction also pass. Signed runner volume restoration preserves interrupted uploads, completed results/previews, source-preview hash and deletion tombstones; stale requests are refused and execution is not duplicated.

Observed local elapsed417577.78096ms covers clone/recovery/application verification and excludes final cleanup; it is not production RTO. Owned cleanup completes; original projects remain running. Five required screenshots are retained under their recovery-capture/unit/tour/structural/splat names. The immutable local runtime build matches ten locked dependency volumes and has no registry download; its only subsequent source change was an integration-test-only type annotation, documented in the prior checkpoint.

O: actual local Compose SQL/S3/OIDC/CPU/browser recovery with authored PDF/PNG/triframe MP4/27-Gaussian fixtures and synthetic reviewers. R: original architecture,45-table exact signed proof, preserved original projects, API source/actor/version/workflow/decimal rules and honest prerequisites. P: actual current runtime/schema restored application and scoped OCR/SIGKILL evidence. V: physical GPU/headset, trained scene/property/country/human/parity/native-distribution/off-host/production acceptance remains unfinished. Engine54/95 accepted,41 unfinished; root120/120 retained and release must refuse unfinished tasks. Next runnable work audits derived objects written before collection commits artifact rows.



## Failed collection storage gap and writer continuation — 11 October 2026 (O/P)

A bounded readonly audit of the cancelled self-authored OCR fixture finds3 actual private objects/23214 bytes with no artifact records (`failed-collection-owned-private-output-audit.log`). It checks one exact authored cancelled stage, prints no keys/source text and mutates nothing. Native/render collection currently writes before the final artifact transaction; failed commits therefore need run-owned cleanup, not only registered-artifact cleanup.

Migration221, applied in both Compose databases, introduces one bounded durable lease per collector, separate leases for concurrent callers, a cleanup-only exact writer completion port and run-prefix erasure jobs. New derived writes have a three-minute aggregate I/O deadline and five-minute lease; erasure waits for active writers and verifies bounded run-prefix deletion. Existing requested erasures receive their missing prefix jobs, while business identities/history and other run prefixes are preserved. API/native/render collectors now reserve before writes and close only their own lease after storage closes. No production OCR/profile/publication capability is added.

The first actual native lane fails all5 cases because the new SQL guard references input_revision instead of the existing current_input_revision column. Migration222 corrects that guard in both databases without editing applied221; the failure is retained in derived-output-writer-real-native-collection.log. API types and initial lint pass; the corrected native lane is running. Recovery now requires46/v5 tables and preserves immutable19/42/44/45-table historical versions;8 recovery-policy checks pass. Actual failed-commit/prefix/erasure/kill and fresh46-table restored application evidence remain pending. The preceding migration220/45-table restore remains passed and predates this continuation.

O: observed authored-fixture orphan objects and actual local database/storage ports. R: every storage writer and erasure must retain exact actor/resource/version/workflow, bounded cancellation/deletion and private lineage. P: migrations/API preparation, retained failed guard and passing type/policy checks above. V: no new task is accepted from unfinished software verification. Engine54/95 accepted,41 unfinished; native-distribution/country/property/GPU/headset/human/parity/off-host/production gates remain unfinished. Continue runnable work.



## Scoped writer/erasure verification continuation — 11 October 2026 (P)

The corrected native collector lane passes all5 actual English/French/native-empty-Arabic/v3 cases, including concurrent collection/replay/source tamper/current scope (`derived-output-writer-current-input-real-native.log`). Migration222 fixes221's incorrect current-input column without changing applied history. The first account/tenant erasure lanes then identify a genuine retention classification bug: the new source FK is mistaken for a business-module reference. Migration223 excludes engine writer leases from that conservative helper; real credential and foreign-tenant references remain protected. Account erasure passes after correction (`derived-output-retention-corrected-account-erasure.log`). Migration224 reconciles only already-requested private originals with an actual engine lease, no real non-engine retained reference and the same current owner/foreign-tenant policy; business records remain retained.

The actual derived collector SIGKILL test has reached its confirmed boundary: real conditional write, no artifact commit, separate durable writer lease, foreign/wrong-version completion refusal, refused lease modification, actual process SIGKILL and tenant erasure deferred with2 pending jobs. It is still waiting through the unchanged five-minute lease (`derived-output-actual-collector-sigkill-erasure.log`); final physical deletion/isolation is not yet accepted. No production fault hook exists. Account erasure now has an authored1001-object uncommitted storage fixture for continuation/pagination, not1001 extracted documents; its new result is pending. The initial tenant first-case retention failure leaves pending runner cleanup and causes the subsequent unconfigured-cleanup/physical-delete failures; the failed lane is retained and its corrected rerun remains pending.

P: all9 workspace types,435 canonical operations, lint/import boundaries, strict new fault-fixture types and8 v5 recovery-policy checks pass. Recovery defaults to46/v5 tables while v1–v4 exact19/42/44/45-table signed coverage stays immutable; the next signed drift challenge targets writer history. Fresh current images/full46-table restore and complete scoped erasure/OCR/generic-render regression remain pending. Engine54/95 accepted,41 unfinished; no new task is accepted.

O: authored original PNG/PDF, actual local SQL/S3/native collection and real killed collector; automated synthetic actors and namespace fixture. R: exact authority/version/workflow, per-collector bounded leases, owning-module retention and no cross-run/mandate cleanup. V: final lease/pagination/current recovery, OCR distribution/country/property/GPU/headset/human/parity/off-host/production acceptance remains unfinished. Continue runnable work.



## Account prefix pagination verified — 11 October 2026 (P)

`derived-output-thousand-object-account-erasure.log` passes actual account erasure with1001 authored uncommitted JSON objects in the persisted run prefix in addition to the registered CPU derivative. Those fixture objects have no artifact rows. Bounded bulk deletion continues across the1000-key listing boundary, verifies an empty prefix and first/last404s, and preserves the genuinely retained credential original/business record. This is real local SQL/S3/runner cleanup of authored namespace data, not1001 extracted documents or a production benchmark. New run-output jobs remain separately fenced and source-owner/other-tenant retention rules are preserved.

The first actual derived collector SIGKILL test reaches full lease expiry, deletes original/uncommitted output, verifies zero pending jobs and preserves the unrelated prefix, then fails only its final expected403-versus-actual hidden-workspace404 assertion. Its failure remains retained in derived-output-actual-collector-sigkill-erasure.log. The corrected complete case is rerunning in derived-output-actual-collector-sigkill-scoped-refusal.log; no clean whole-case pass is claimed yet. Prefix cleanup also refuses incomplete truncated listings rather than acknowledging them. Migrations221–224 are immutable/applied in both databases. A fresh five-image build is running for the46/v5 restore; current all-unit checks are running.

The quality-summary wording now correctly distinguishes pages awaiting text extraction from facts awaiting review; operator browser text expectation follows that wording. The display change introduces no approval or changed fact count. Corrected tenant/OCR/operator lanes and full46-table signed application restoration remain pending. O: actual local source/storage/pagination and real killed collector, authored namespace fixtures and synthetic actors. R: actor/resource/version/workflow, bounded writes, private lineage and owning-module retention. P: passing real account pagination and retained scoped failure above. V: unfinished software verification, ordered dependencies and external native-distribution/country/property/GPU/headset/human/parity/off-host/production gates remain. Engine54/95 accepted,41 unfinished; continue runnable work.



## Durable output erasure verified — 11 October 2026 (P)

The corrected real collector SIGKILL case passes in `derived-output-actual-collector-sigkill-scoped-refusal.log`: actual successful private storage write before artifact commit, real process kill, unchanged five-minute durable writer lease, deferred erasure, original/output404s, empty run prefix, zero pending jobs, preserved unrelated prefix and hidden-workspace404 on late collection. The earlier403 assertion failure is retained separately; no production timing is inferred from the local304119ms case. `derived-output-corrected-tenant-erasure.log` passes3 actual SQL/S3/runner cases and both desktop/mobile erasure journeys. The separate1001-object account pagination case remains passed with credential/business retention.

P: all224 units/72files pass (`derived-output-current-all-units.log`). Current five locked source-only recovery images build with matching dependency lock,10 dependency volumes and no registry download (`derived-output-224-current-recovery-images.log`). All9 types,435 canonical operations, lint and8 v5 recovery-policy tests already pass. Current native-first/OCR/review and generic-render/operator regression are being refreshed before the46/v5 signed restored-application drill; that drill is not yet accepted. API/schema/runtime remain fixed for the verification.

O: authored original pixels and namespace fixtures, actual local SQL/S3/runner/process kill and synthetic scoped actors. R: exact actor/resource/version/workflow, bounded writers, private lineage, module retention, immutable migrations221–224 and preserved original projects. V: only the stated software evidence passes. Engine54/95 accepted,41 unfinished; ordered prerequisites and native distribution/country/property/GPU/headset/human/parity/off-host/production gates remain unaccepted. Continue runnable work.



## Current collector regressions passed;46-table restore running — 11 October 2026 (P)

`derived-output-current-native-ocr-review-browser.log` passes5 actual confined native-first/OCR SQL/S3 cases and both desktop/mobile source review journeys. `derived-output-current-operator-render-browser.log` passes the actual queued CPU rendering/fact collection/operator journeys on both viewports. The writer guard, source-current scope, immutable page receipts, assisted label/manual trace and source-linked pending review remain intact. Final full lint/import boundaries and all9 workspace types pass in derived-output-final-lint.log and derived-output-final-workspace-types.log.

The fresh `node scripts/recovery/test-processing.mjs --application` is running in derived-output-224-current-46-table-restored-application.log against current locked runtime images and immutable migrations through224. Its signed v5 proof must include all46 tables, including durable output writer history, and explicitly refuse authenticated writer-history drift. Runtime/schema are frozen for the drill. No result is accepted yet; the prior passed45/v4 drill predates writer guards.

O: self-authored actual documents and synthetic scoped local actors. R: source/actor/version/workflow, API-owned rules, private lineage and preserved original projects. P: exact passing software lanes above. V:46-table recovery, ordered dependencies and native distribution/country/property/GPU/headset/human/parity/off-host/production acceptance remain unfinished. Engine54/95 accepted,41 unfinished; continue runnable work.



## Current46/v5 restored application passed — 11 October2026 (P)

`node scripts/recovery/test-processing.mjs --application` exits0 in derived-output-224-current-46-table-restored-application.log. All46 v5 table proofs reconcile, including durable output-writer history. Ciphertext tamper and deliberately signed writer-history drift are refused.2497 private original objects/118174349 bytes are copied and checksum-verified with aggregate cfa243f262dd500226303afe26c4077e305fb0822f6f53cebe8ac9b2243ace06 and sourceMutated=false. The current immutable migration224 runtime passes actual OIDC upload/queued CPU collection/source-linked review, independently reviewed shared-unit/canonical-location proposals, panorama and structural/authored-splat publication/public rendering/withdrawal, plus private multipart capture/scanning/binding/clip validation/frame extraction. Signed runner-volume restoration verifies actual decoder output, interrupted upload, completed receipt/preview/hash, deletion tombstone, stale-request refusal and no duplicate execution.

Observed local elapsed475782.570835ms covers clone/recovery/application verification and excludes final cleanup; it is not production RTO. The command exits0 after scoped owned cleanup. Original projects stay running. Five required recovery screenshots remain retained. The five runtime images match10 locked dependency volumes with no registry download; the only subsequent runtime-test-source edit is the fixture-provenance unit expectation7->8, with no API/worker/viewer/schema change. The earlier failed fixture-count check remains retained; its corrected guard passes.

The expanded16-lane software composite is now running in derived-output-current-sixteen-lane-software.log, including the new actual derived collector SIGKILL/full-lease lane; no whole composite pass is claimed yet. Current normal root/engine ledgers validate, and release correctly exits1 for41 unfinished engine tasks and existing reference/off-host gates. Engine54/95 accepted; root120/120 preserved.

O: actual local Compose SQL/S3/OIDC/CPU/browser recovery, authored PDF/PNG/triframe MP4/27-Gaussian fixtures and synthetic reviewers. R: exact actor/resource/version/workflow/decimal rules,46-table signed proof, immutable historical coverage and original-project preservation. V: physical GPU/headset, admitted trained scene/country/property models, human/parity and off-host/production release remain unfinished. Continue runnable work; no whole-engine completion.

