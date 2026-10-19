# HE-D09 — provisional generic source fact review

## Acceptance

In progress. The specification explicitly permits provisional generic HE-D09 review before country fixtures, but final acceptance requires HE-D08 and its country fixture contracts. No dependency is marked complete by this private implementation.

## Implementation

`DigitizationFactController` exposes current private fact review and append-only decisions through the existing API/session transport. `fact-review.ts` checks current agency/target/resource scope, workspace/input/candidate versions, active workflow, typed corrected values and source pages. The mutation controller independently verifies actual current source bytes before its short transaction. It increments workspace version and serializes concurrent decisions using the existing workspace lock. Decision timestamps are assigned after acquiring that lock. Original candidate text, evidence and extraction remain unchanged.

The ops panel displays the exact original quote, original page number, hash-verified private raster crop and optional full page. Explicit accept/correct/reject/unknown/conflict decisions require reasons. Counts require explicit integers; quantities remain decimal strings. Parallel conflicting values remain visible until explicitly resolved. History is retained; no inventory or publication mutation occurs. GETs and previews remain private; actor/target/source revocation clears unavailable review data.

## Tests

`./test-ocr-protocol.sh`: three real confined English/French/Arabic raster-PDF journeys pass, including two original English pages, persisted raw tokens, exact crop/value lineage, private preview bytes, concurrent result collection, idempotent replay, tampered source, stale revision/fence and foreign agency denial.

The extended English integration journey checks type/value rejection, a concurrent decision race with one success, unchanged original candidate, correction history, conflict visibility and explicit rejection resolving the conflict. See `evidence/digitization/fact-review-real-ocr-api.log`.

`./test-ocr-protocol.sh fact-review`: the initial run passed five real OCR/database journeys, then failed the two browser checks because a wrapped select label included option text in the DOM label lookup. The panel now supplies an explicit accessible select name. The initial failure is preserved in `evidence/digitization/fact-review-real-browser.log`; final browser results are recorded separately after correction.

`docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T api pnpm typecheck`: all nine workspace type checks pass (`fact-review-all-types.log`).

`docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T api pnpm lint`: passes application import boundaries (`fact-review-lint.log`).

Contract generation records 390 canonical API operations. Contract/API compiled runtime checks are in `fact-review-contract-build.log`, `fact-review-api-build.log` and `fact-review-final-api-build.log`. The initial broad unit run was interrupted by the API runtime restart and is not a passing suite (`fact-review-all-units.log`); the completed final run is recorded separately.

## Final verification continuation — P

The second browser run exposed late same-version refreshes clearing the selected fact; it is preserved in `fact-review-final-real-browser.log`. Request generations now reject late responses, same-version refreshes preserve the selection and changed source/workspace revisions clear it. The final actual desktop/mobile checks pass 2/2 in `fact-review-stable-real-browser.log`, exercising real OIDC/session/API/SQL/S3, exact quoted crop viewBox/asset lineage, acceptance, decimal-string correction, competing-source rejection, immutable history, reload and stale mutation denial. No browser response or fixture is mocked.

The optional UI integration record added to the root ledger also exposed a missing synthetic evidence file in the isolated ledger unit fixture. The fixture now supplies that record's declared evidence without changing live root task records or weakening either release gate. The failed 178/179 run is retained in `fact-review-final-all-units.log`; the corrected full run passes 179/179 in 55 files (`fact-review-stable-all-units.log`).

`flock -n /tmp/haven-integration.lock docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests run --rm --no-deps tests pnpm exec playwright test tests/e2e/digitization-fact-review.spec.ts --project=desktop --project=mobile`: 2 passed.

`docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T api pnpm test:unit`: 179 passed.

Final `./test-ocr-protocol.sh` rerun: 3/3 passed in `fact-review-final-real-ocr-api.log`, including tampered source-byte preflight before decisions. Final lint, ops types and 390-operation contract checks pass in `fact-review-stable-lint.log`, `fact-review-final-ops-types.log` and `fact-review-final-contract-check.log`. API compiled runtime records 171 files in `fact-review-final-api-build.log`.

`docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T api node scripts/tasks.mjs`: passes 120 root tasks and 95 engine tasks with 53 accepted (`fact-review-final-task-validation.log`).

`docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T api node scripts/tasks.mjs --release`: expected exit 1; all 42 unfinished engine rows remain release errors (`fact-review-final-release-rejection.log`).

## Limitations

Provisional generic private review only. Country profiles/representative benchmarks, production OCR admission, complete conflict-to-inventory application workflow, reviewed public packages and whole-engine release remain unfinished. CI actor decisions are not human approval, ownership authentication or a property measurement.

## Next dependency

HE-D02–HE-D08 acceptance and independent country fixture contracts, followed by final HE-D09 acceptance and HE-D10 inventory mapping. The supplied prerequisite graph remains intact.

## O

Self-authored English/French/Arabic raster documents, actual original page pixels, SQL/S3/runner receipts and synthetic CI actors.

## R

Preserved specification, provisional source-review ordering, current authority/revision rules and decimal-string quantities.

## P

Actual local Compose implementation and integration checks with independently verified source evidence; results are limited to the named commands/logs.

## V

No country/customer accuracy, human/parity approval, production OCR/distribution, physical GPU/headset, public package or full HE-D09/R1–R4 completion claim.


## User clarification: generic documents and host resources — 10 October 2026

The user specified using the local host and extracting facts from documents without requiring a particular country template; unavailable facts must remain unfilled. Generic extraction now has explicit v3 evidence-backed English/French/Arabic text fields (country/region/city/district/address/property type/tenure/owner/boundary), string identifiers preserving leading zeros, and explicit standalone count phrases in flexible line/semicolon layouts. Original quote/page/crop and pending review remain attached. Blank/unknown/n/a fields and unlabeled numbers do not generate candidates. The API independently rechecks each normalized value against actual retained native/OCR text and refuses version substitution or invented text. No document author claim creates owner authority or canonical geography automatically.

Current host inventory: Intel i9-10885H,16 logical CPU threads,62 GiB RAM, and NVIDIA GTX1650Ti Mobile PCI device. The running kernel is7.0.0-34-generic and `modinfo nvidia` reports no module; `nvidia-smi` cannot communicate with a driver. CPU workers run on the existing host through bounded Compose services. This is a missing usable CUDA driver/runtime, not an absent physical GPU. No kernel/driver installation, hardware device acceptance or GPU processing result is claimed.

No special document template or representative country upload is required for the generic extraction/review/private draft path. Representative country/property fixtures remain acceptance inputs for disabled specialized profiles and physical reconstruction benchmarks only. Mandatory canonical unit fields remain blank in the intake until explicitly supplied; creating a canonical unit without them would require invented values and is blocked.

O: user's latest clarification, actual host CPU/RAM/PCI/driver probes and retained actual document text. R: format-independent supported-document extraction with unknowns omitted, exact source evidence and host resource limits. P: generic v3 implementation, actual native-PDF parsing and strict API validation. V: current CUDA driver unavailable; GPU/headset, specialized benchmark/admission and downstream software acceptance remain pending.


## Generic path final verification — 10 October 2026 (P)

Final broader checks:184 TypeScript units across57 files (`generic-format-final-all-unit-tests.log`),125 processing checks (`generic-format-final-all-cpu-tests.log`), all9 workspace typechecks, lint and392-operation contract check. The final unknown-identifier hardening additionally passes31 source/extraction checks (`generic-unknown-fields-final-tests.log`) and13 native/v3 API projection checks (`generic-unknown-final-api-tests.log`). Actual arbitrary-layout native PDF keeps City Dubai, Property type Apartment, Plot00123 and explicit2bedrooms while omitting unavailable fields; original undersized authored PDF test failure is retained and corrected with a source page wide enough for its printed text. `generic-format-real-ocr-browser-journeys.log` passes5 actual confined scanned-PDF OCR cases and2 desktop/mobile review/correction/conflict resolution/canonical geography/private draft journeys. Test-only pinned OCR image uses a read-only current-source mount; this is explicitly not production admission.

The final separate-camera CPU run records camera groups1 and2,16 registered cameras,2769 points and median reprojection0.5882330781237699 pixels, primary advisory passed without fallback (`colmap-two-groups-final-real-solve.log`). Earlier poor-registration bounded-fallback evidence is retained; no deterministic reconstruction parity is claimed. Source code, private scope/workflow checks and release gates remain authoritative. Accepted task count remains53/95,42 unfinished (17in_progress,25todo); substantial downstream software remains as well as unusable current CUDA driver/hardware acceptance and production admission.

O: actual host/resource/source/CPU/OCR/browser observations. R: user's generic-document/unknowns instruction and preserved specification acceptance. P: above retained results. V: remaining42 exact task acceptances, production model/dependency admission, CUDA/headset and downstream release software/validation remain pending.


## Immutable native/OCR page continuation — 11 October 2026 (P)

The actual native-then-OCR test reproduces a production schema problem: collection of the OCR receipt fails on document_pages_binding_id_page_key after native extraction has already persisted the same original pages (`native-before-ocr-page-key-reproduction.log`). Its English native extraction correctly abstains on authored raster pages and requires OCR for pages1/2; French/Arabic OCR cases pass. The earlier fixture used the wrong run identifier and fails before this boundary (`native-before-ocr-current-boundary.log`); it is retained separately.

Migration220, applied to both Compose databases, replaces the per-binding/page uniqueness with per-binding/page/preview-receipt uniqueness. Existing rows, private RLS and immutable guards remain. Fact review selects one deterministic OCR-preferred preview per source page, while both native and OCR receipts stay immutable. Plan labels select the latest completed OCR receipt deterministically. The quality summary counts distinct native-required pages and subtracts only completed OCR pages matching the same asset/source hash/page; facts remain pending and no inventory/public approval is inferred.

P: both migration applications,5 quality/decimal policy checks,8 recovery-policy checks, full lint/import boundaries and all9 workspace types pass in document-page-receipts logs. `native-before-ocr-immutable-quality-browser.log` is running; its real sequence/immutable receipt/current source/browser result is not yet accepted. The prior45-table full restore predates migration220 and assisted labels. Current-image/signed restore verification remains pending.

O: actual confined native/OCR execution on authored raster PDFs, actual local SQL/S3 and synthetic actors; no representative customer/country accuracy. R: preserved specifications, immutable lineage, API-owned rules, exact actor/resource/version/workflow, decimal strings and ordered prerequisites. V: this is an unfinished software verification checkpoint. Engine54/95 accepted,41 unfinished; root120/120 retained. OCR distribution, physical GPU/headset, human/parity, off-host/production gates remain unresolved. Continue runnable work.



## Native then OCR sequence verified — 11 October 2026 (P)

`native-before-ocr-immutable-rls-quality-browser.log` passes all5 actual confined OCR/SQL/S3 cases and both desktop/mobile OIDC journeys. The English fixture first runs real native extraction on authored raster pages, correctly abstains and reports two OCR-required pages, then collects actual OCR for the same original. Both immutable page receipts remain; duplicate insertion is refused, RLS updates affect zero rows and original tokens remain unchanged. Review selects exactly two OCR-preferred previews. The private quality summary falls from2 unresolved pages to0 while both extracted facts remain pending/reviewRequired and publiclyServed=false. Source tamper, stale/foreign scope and assisted label/edit/trace/save/reload/accessibility/width checks pass.

The first post-migration run passes4/5 cases but expects an exception for a row-level-policy denied update; it receives zero affected rows instead and remains retained in native-before-ocr-immutable-quality-browser.log. The corrected assertion verifies the actual denial and unchanged tokens. Migration220 is applied in both Compose databases. Five quality/decimal policy tests,8 recovery-policy tests, all9 workspace types and lint/import boundaries pass. The fresh immutable-image build and the actual copier SIGKILL/full five-minute cleanup test are running; no result or new restored-application pass is claimed yet.

O: authored raster PDF pixels and actual local native/OCR/SQL/S3/OIDC/browser observations with synthetic actors. R: immutable source lineage, API business rules, exact version/scope/workflow, decimal strings and ordered acceptance. V: OCR production distribution, representative country/property benchmarks, human/parity, trained GPU/headset and off-host/production gates remain unaccepted. Engine54/95 accepted,41 unfinished; release still refuses unfinished tasks. Continue runnable work.



## Current collector regressions passed;46-table restore running — 11 October 2026 (P)

`derived-output-current-native-ocr-review-browser.log` passes5 actual confined native-first/OCR SQL/S3 cases and both desktop/mobile source review journeys. `derived-output-current-operator-render-browser.log` passes the actual queued CPU rendering/fact collection/operator journeys on both viewports. The writer guard, source-current scope, immutable page receipts, assisted label/manual trace and source-linked pending review remain intact. Final full lint/import boundaries and all9 workspace types pass in derived-output-final-lint.log and derived-output-final-workspace-types.log.

The fresh `node scripts/recovery/test-processing.mjs --application` is running in derived-output-224-current-46-table-restored-application.log against current locked runtime images and immutable migrations through224. Its signed v5 proof must include all46 tables, including durable output writer history, and explicitly refuse authenticated writer-history drift. Runtime/schema are frozen for the drill. No result is accepted yet; the prior passed45/v4 drill predates writer guards.

O: self-authored actual documents and synthetic scoped local actors. R: source/actor/version/workflow, API-owned rules, private lineage and preserved original projects. P: exact passing software lanes above. V:46-table recovery, ordered dependencies and native distribution/country/property/GPU/headset/human/parity/off-host/production acceptance remain unfinished. Engine54/95 accepted,41 unfinished; continue runnable work.



## Current exact minimum verification — 11 October 2026 (P)

`./test-ocr-protocol.sh fact-review` exits0 in derived-output-current-native-ocr-review-browser.log:5 actual authored authorized English/French/Arabic/native-first OCR SQL/S3 cases and2 desktop/mobile accept/correct/source-crop/immutable-history journeys. Nonempty source-linked raw tokens and crop review satisfy the stated software minimum. This verification does not complete the task: production native/model distribution admission and ordered country/conflict prerequisites remain unfinished. No country accuracy or Arabic quantity correctness is inferred.

O: self-authored original pixels and actual confined execution, synthetic scoped actors. R: exact stated minimum, immutable source evidence and preserved acceptance order. V: status remains in_progress; engine54/95 accepted,41unfinished.

## Local functional continuation — 12 October 2026 (O/R/P/V)

O: authored source pixels and actual local Compose services. R: original task acceptance, exact source/actor/revision/workflow and unknown-field abstention. P: local OCR is usable through API-owned document processing with the existing durable queue/worker, source-linked pending review and conditional operator action. PNG and EXIF-rotated JPEG persistence pass in `local-ocr-start-corrected-functional-validation.log`; the actual running queue journey passes in `local-ocr-queued-corrected-functional-journey.log`. Trilingual/multipage OCR passes in `ocr-no-gui-functional-smoke.log`. Disabled country profiles now also abstain from explicit unknown text; five focused checks pass in `country-unknown-functional-validation.log`. The changed contracts/API/ops types and focused lint pass. V: these supersede older statements that no local OCR persistence exists; production/native/model admission, country representative accuracy and unfinished task prerequisites remain unaccepted. Status remains in_progress.
