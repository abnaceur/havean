# HE-J01 — Private quality summary

Status: in_progress.

The source-linked private summary reports fact counts, pending decisions, conflicts, unresolved native-PDF OCR pages and current plan scale. Documentary and room-net areas remain separate. Same-unit/same-basis quantities use exact BigInt decimal subtraction; unknown/different units or bases are incomparable. Reconstruction metrics remain explicitly unavailable until actual reconstruction collection is integrated. Three meaningful comparison unit tests pass; wider API/browser checks are ongoing. Dependencies HE-D10 and HE-H03 are not accepted.

O: self-authored fixture documents and synthetic test identities; no customer document or measured property accuracy.
R: preserved specification, API ownership, decimal quantities and missing-information abstention.
P: actual local Compose tests; see operator-processing-real-browser-journeys.log, operator-processing-real-port-tests.log and quality-summary-unit-tests.log.
V: no independent human/parity approval, production OCR admission, GPU/headset acceptance, release pass or whole-task completion.


## Immutable native/OCR page continuation — 11 October 2026 (P)

The actual native-then-OCR test reproduces a production schema problem: collection of the OCR receipt fails on document_pages_binding_id_page_key after native extraction has already persisted the same original pages (`native-before-ocr-page-key-reproduction.log`). Its English native extraction correctly abstains on authored raster pages and requires OCR for pages1/2; French/Arabic OCR cases pass. The earlier fixture used the wrong run identifier and fails before this boundary (`native-before-ocr-current-boundary.log`); it is retained separately.

Migration220, applied to both Compose databases, replaces the per-binding/page uniqueness with per-binding/page/preview-receipt uniqueness. Existing rows, private RLS and immutable guards remain. Fact review selects one deterministic OCR-preferred preview per source page, while both native and OCR receipts stay immutable. Plan labels select the latest completed OCR receipt deterministically. The quality summary counts distinct native-required pages and subtracts only completed OCR pages matching the same asset/source hash/page; facts remain pending and no inventory/public approval is inferred.

P: both migration applications,5 quality/decimal policy checks,8 recovery-policy checks, full lint/import boundaries and all9 workspace types pass in document-page-receipts logs. `native-before-ocr-immutable-quality-browser.log` is running; its real sequence/immutable receipt/current source/browser result is not yet accepted. The prior45-table full restore predates migration220 and assisted labels. Current-image/signed restore verification remains pending.

O: actual confined native/OCR execution on authored raster PDFs, actual local SQL/S3 and synthetic actors; no representative customer/country accuracy. R: preserved specifications, immutable lineage, API-owned rules, exact actor/resource/version/workflow, decimal strings and ordered prerequisites. V: this is an unfinished software verification checkpoint. Engine54/95 accepted,41 unfinished; root120/120 retained. OCR distribution, physical GPU/headset, human/parity, off-host/production gates remain unresolved. Continue runnable work.



## Native then OCR sequence verified — 11 October 2026 (P)

`native-before-ocr-immutable-rls-quality-browser.log` passes all5 actual confined OCR/SQL/S3 cases and both desktop/mobile OIDC journeys. The English fixture first runs real native extraction on authored raster pages, correctly abstains and reports two OCR-required pages, then collects actual OCR for the same original. Both immutable page receipts remain; duplicate insertion is refused, RLS updates affect zero rows and original tokens remain unchanged. Review selects exactly two OCR-preferred previews. The private quality summary falls from2 unresolved pages to0 while both extracted facts remain pending/reviewRequired and publiclyServed=false. Source tamper, stale/foreign scope and assisted label/edit/trace/save/reload/accessibility/width checks pass.

The first post-migration run passes4/5 cases but expects an exception for a row-level-policy denied update; it receives zero affected rows instead and remains retained in native-before-ocr-immutable-quality-browser.log. The corrected assertion verifies the actual denial and unchanged tokens. Migration220 is applied in both Compose databases. Five quality/decimal policy tests,8 recovery-policy tests, all9 workspace types and lint/import boundaries pass. The fresh immutable-image build and the actual copier SIGKILL/full five-minute cleanup test are running; no result or new restored-application pass is claimed yet.

O: authored raster PDF pixels and actual local native/OCR/SQL/S3/OIDC/browser observations with synthetic actors. R: immutable source lineage, API business rules, exact version/scope/workflow, decimal strings and ordered acceptance. V: OCR production distribution, representative country/property benchmarks, human/parity, trained GPU/headset and off-host/production gates remain unaccepted. Engine54/95 accepted,41 unfinished; release still refuses unfinished tasks. Continue runnable work.



## Account prefix pagination verified — 11 October 2026 (P)

`derived-output-thousand-object-account-erasure.log` passes actual account erasure with1001 authored uncommitted JSON objects in the persisted run prefix in addition to the registered CPU derivative. Those fixture objects have no artifact rows. Bounded bulk deletion continues across the1000-key listing boundary, verifies an empty prefix and first/last404s, and preserves the genuinely retained credential original/business record. This is real local SQL/S3/runner cleanup of authored namespace data, not1001 extracted documents or a production benchmark. New run-output jobs remain separately fenced and source-owner/other-tenant retention rules are preserved.

The first actual derived collector SIGKILL test reaches full lease expiry, deletes original/uncommitted output, verifies zero pending jobs and preserves the unrelated prefix, then fails only its final expected403-versus-actual hidden-workspace404 assertion. Its failure remains retained in derived-output-actual-collector-sigkill-erasure.log. The corrected complete case is rerunning in derived-output-actual-collector-sigkill-scoped-refusal.log; no clean whole-case pass is claimed yet. Prefix cleanup also refuses incomplete truncated listings rather than acknowledging them. Migrations221–224 are immutable/applied in both databases. A fresh five-image build is running for the46/v5 restore; current all-unit checks are running.

The quality-summary wording now correctly distinguishes pages awaiting text extraction from facts awaiting review; operator browser text expectation follows that wording. The display change introduces no approval or changed fact count. Corrected tenant/OCR/operator lanes and full46-table signed application restoration remain pending. O: actual local source/storage/pagination and real killed collector, authored namespace fixtures and synthetic actors. R: actor/resource/version/workflow, bounded writes, private lineage and owning-module retention. P: passing real account pagination and retained scoped failure above. V: unfinished software verification, ordered dependencies and external native-distribution/country/property/GPU/headset/human/parity/off-host/production gates remain. Engine54/95 accepted,41 unfinished; continue runnable work.


## Current local continuation — 12 October 2026 (O/R/P/V)

O/P: Local CPU camera stages now traverse the durable API/queue/worker with immutable recipe/frame/source lineage, confinement, private calibrated export and review reports. The actual queued reference-derived clip registers16 views/3364 points; no metric scale, room coverage, physical property or GPU result is inferred. Recovery now describes47 tables in v6 while preserving historical versions; only the focused descriptor validation was rerun. Evidence: `camera-queued-functional-journey.log`.

R/V: exact original acceptance and prerequisites remain mandatory. Production model/native admission, representative country/property/calibration inputs, physical GPU/headset, independent human/parity and current release/recovery gates remain unaccepted. Status stays in_progress; no whole-engine completion.

## Non-VR camera review correction — 12 October 2026 (O/R/P/V)

O: code review found that only the largest reconstructed model contributed its component count to the operator summary. R: disconnected reconstructions must remain visible without double-counting registered frames shared by separate models. P: API cameraReviewMeasurements now retains largest-model view/point counts and sums connected components over every returned model. Frame review and property quality display these meanings explicitly. `camera-disconnected-review-functional.log` passes one focused synthetic multi-model check; `camera-quality-current-browser-functional.log` passes one actual scoped browser journey against the retained real16-view/3364-point CPU output. V: this is reporting evidence, not an independent disconnected-room/property benchmark or full task acceptance.
