## Acceptance
Generic anchored extraction must abstain on missing bedroom counts. Task remains in progress while HE-D02/HE-D03 and actual runner/input integration are unfinished.

## Implementation
`facts.py` accepts bounded upright OCR lines with valid page/rectangle coordinates. It proposes only explicitly labeled unit IDs and area definitions, preserves original quoted text and parallel conflicting candidates, and sets an uncalibrated extraction score to null. Unknown labels, ambiguous separators and instruction-like text produce no guessed values or commands. No country/geography/ownership authentication is inferred.

## Tests
`./test-processing.sh` passes 42 CPU checks. Real generic extraction tests preserve mixed-language source text and page/bbox evidence, leading zeros, conflicts and built-up versus unit area. Missing bedroom fields remain absent; malformed source shapes return fixed error codes. Log: `evidence/digitization/validation/facts-cpu.log`.

## Limitations
The supplied test rectangles are labeled synthetic fixtures, not output from an installed OCR model. No full engine draft exists from this component alone. Review, persistence and scoped source binding are still required.

## Next dependency
HE-D02, then runtime fact extraction and HE-D08/D09 reviewer integration.

## O
No customer evidence used.

## R
Source-linked abstention and preservation of unknown/conflicting facts.

## P
Synthetic multilingual fixture results.

## V
No benchmark or independent approval claimed.

## Real native-text execution continuation — P
The runner now allowlists `generic-native-facts-{en,fr,ar}-v1` as `fact_extract` profiles over a scanned-approved PDF source grant. They execute actual PDFium glyph/raster processing in the mandatory decoder sandbox, then generic anchored extraction. Every candidate references the same source asset/page and actual upright glyph box; countryProfile remains null, extractionScore is null and reviewRequired is true. Empty/cropped/native-unreadable pages request OCR rather than inventing a draft. This is native-text extraction, not OCR, a country profile or legal verification.

`./test-processing.sh`: 69 passed in 10.49 seconds (`validation/native-fact-profiles-final.log`). The initial run passed 68 but failed one stale readiness-profile expectation; corrected expected registry and retained the failed log. Real English leading-zero ID and French decimal normalization run through durable receipts/native glyphs/private previews, missing bedrooms stay absent and the Arabic-configured textless fixture abstains. `./test-runner-protocol.sh`: one actual Node/Python journey passes, now including a separate fact_extract execution with the exact source-linked `00123` candidate (`validation/native-fact-protocol.log`). Targeted lint passes. No actual Arabic text fixture, PaddleOCR, fact persistence/decision UI, current Haven-run capability or full HE-D04 acceptance is inferred; task stays in_progress.

## Real OCR and explicitly documented counts — 10 October 2026 (P)

The anchored-v2 investigation accepts only complete labeled integer room/parking segments in English, French and Arabic. Missing values, ranges, approximations, decimals and instruction-like prefixes abstain; explicitly printed zero remains distinct from missing. Contradictory values retain separate source pages. Existing anchored-v1 execution profiles remain unchanged. Source-linked OCR proposals use actual quadrilateral bounds, declared locale, expected raster checksum and expected original page. The API rejects changed values/units/area basis even when a quoted crop exists and always supplies a pending review state.

Actual two-page PaddleOCR-to-Node preparation is retained in `ocr-confined-durable-api-projection-document-report.json`; 108 CPU checks and7 API preparation checks pass. O: synthetic authored document pixels and native text, not country benchmarks. R: source-backed candidates and empty missing fields. P: actual original-page/crop provenance and value revalidation. V: task remains in progress pending HE-D02/HE-D03 acceptance, persistent fact/decision workflow and UI. No proposed field is an approved inventory update.

## Native document source binding — 10 October 2026 (P)

Supported native-glyph v1 execution receipts now include the hash of the actual PDF bytes read inside the confined decoder and the explicit locale. The API has a separate strict native-result preparation boundary: it verifies current supplied source identity/hash/locale, sequential original pages, exact glyph quote/crop, unchanged normalized value and exact OCR-required page list. It preserves the v1 extractor identity, leading-zero IDs and server-owned pending review; native v1 cannot inject counts, approval, confidence or source identities. Scanned pages remain unresolved and empty rather than acquiring synthetic OCR. This preparation still has no persistence, publication or new route side effect.

108 real confined CPU regressions pass (`native-document-source-binding-cpu-regression.log`);11 native/OCR API projection guards pass (`native-document-api-projection-units.log`), including4 synthetic native-boundary cases. API types, full lint and compiled API build pass;175 unit checks/54 files and16 processing-license guards pass. The CPU test image now has the explicit version `haven-processing-tests-cpu:1.0.0-cpu-v1`; its checked local test recipe is distinguished from pulled deployment images and cannot admit production or an imported alias. Earlier implicit-tag gate failures are retained.

O: self-authored actual native PDFs and explicit synthetic API records. R: source lineage, decimal strings and fixed empty missing fields. P: actual isolated Compose decoding, API validation and build checks. V: no automatic fact approval, persisted decisions, country/customer benchmark, production OCR or task completion claim.

## Transactional native fact collection — 10 October 2026 (P)

The API collection port now persists validated native-glyph candidates and a checksum-bound private JSON receipt in the same transaction as stage completion. It checks actor/agency/current source grant, source bytes, workspace version, input revision, profile, execution and fence. Conditional storage creation and a second exact object hash check precede commit. Repeated and concurrent collection return the winning immutable receipt without duplicate candidates; even completed native receipts recheck actual source bytes. Candidate review stays pending, zero fields produce an empty candidate set, and scanned pages remain explicitly OCR-required. No fact decision or inventory/public mutation occurs.

The existing coordinator collection transport dispatches native fact stages through this port while retaining its exact execution/state/artifact-ID response contract. No new browser route or runtime OCR profile is enabled. Failure states retain the existing bounded stage/error handling. Source-linked OCR token persistence and crop review UI remain pending.

`native-fact-collector-final-concurrent-workflow.log` passes3 actual isolated native/API/SQL/S3 journeys for English/French/native-empty Arabic PDFs, including cold concurrent coordinator/direct collection, checksum/locale validation, exact decimals/leading zeros, foreign scope/fence denial, replay after stored-source tampering, input replacement and private pending receipts. The Arabic fixture is blank and validates abstention only. Final176 unit checks/54 files, full lint, API types and169 compiled API files pass; actual compiled collection imports also pass (`native-fact-collector-compiled-imports.log`). No new migration was needed.

O: self-authored actual PDFs and synthetic scoped CI actors. R: original architecture, current source/version/workflow checks and empty missing fields. P: actual confined decoder and transactional private native candidate collection. V: no reviewed facts, automatic inventory fill, production OCR/model admission, country/customer accuracy, human/parity or D02/D04 completion claim.

## Private persistence and provisional source review continuation — 10 October 2026 (P)

The real authored English/French/Arabic confined OCR receipts now commit actual original PDF/raster lineage, private page previews, raw tokens and pending source-linked candidates through the existing collection port. Final `./test-ocr-protocol.sh` passes 3 real API/SQL/S3 journeys; source tamper, replay, concurrent collection/decisions, foreign scope and stale revision/fence guards are exercised. Provisional generic review shows actual original quote/crop, appends reasoned decisions and preserves original candidates/history; 2 real desktop/mobile journeys pass. See HE-D09.md and fact-review-final-real-ocr-api.log/fact-review-stable-real-browser.log.

O: self-authored document pixels and CI actors. R: preserved ordered dependencies and empty/decimal-string rules. P: actual private Compose execution. V: no production OCR/model distribution, representative country/customer accuracy, human/parity/publication or full task acceptance; status remains in_progress.


## User clarification: generic documents and host resources — 10 October 2026

The user specified using the local host and extracting facts from documents without requiring a particular country template; unavailable facts must remain unfilled. Generic extraction now has explicit v3 evidence-backed English/French/Arabic text fields (country/region/city/district/address/property type/tenure/owner/boundary), string identifiers preserving leading zeros, and explicit standalone count phrases in flexible line/semicolon layouts. Original quote/page/crop and pending review remain attached. Blank/unknown/n/a fields and unlabeled numbers do not generate candidates. The API independently rechecks each normalized value against actual retained native/OCR text and refuses version substitution or invented text. No document author claim creates owner authority or canonical geography automatically.

Current host inventory: Intel i9-10885H,16 logical CPU threads,62 GiB RAM, and NVIDIA GTX1650Ti Mobile PCI device. The running kernel is7.0.0-34-generic and `modinfo nvidia` reports no module; `nvidia-smi` cannot communicate with a driver. CPU workers run on the existing host through bounded Compose services. This is a missing usable CUDA driver/runtime, not an absent physical GPU. No kernel/driver installation, hardware device acceptance or GPU processing result is claimed.

No special document template or representative country upload is required for the generic extraction/review/private draft path. Representative country/property fixtures remain acceptance inputs for disabled specialized profiles and physical reconstruction benchmarks only. Mandatory canonical unit fields remain blank in the intake until explicitly supplied; creating a canonical unit without them would require invented values and is blocked.

O: user's latest clarification, actual host CPU/RAM/PCI/driver probes and retained actual document text. R: format-independent supported-document extraction with unknowns omitted, exact source evidence and host resource limits. P: generic v3 implementation, actual native-PDF parsing and strict API validation. V: current CUDA driver unavailable; GPU/headset, specialized benchmark/admission and downstream software acceptance remain pending.


## Generic path final verification — 10 October 2026 (P)

Final broader checks:184 TypeScript units across57 files (`generic-format-final-all-unit-tests.log`),125 processing checks (`generic-format-final-all-cpu-tests.log`), all9 workspace typechecks, lint and392-operation contract check. The final unknown-identifier hardening additionally passes31 source/extraction checks (`generic-unknown-fields-final-tests.log`) and13 native/v3 API projection checks (`generic-unknown-final-api-tests.log`). Actual arbitrary-layout native PDF keeps City Dubai, Property type Apartment, Plot00123 and explicit2bedrooms while omitting unavailable fields; original undersized authored PDF test failure is retained and corrected with a source page wide enough for its printed text. `generic-format-real-ocr-browser-journeys.log` passes5 actual confined scanned-PDF OCR cases and2 desktop/mobile review/correction/conflict resolution/canonical geography/private draft journeys. Test-only pinned OCR image uses a read-only current-source mount; this is explicitly not production admission.

The final separate-camera CPU run records camera groups1 and2,16 registered cameras,2769 points and median reprojection0.5882330781237699 pixels, primary advisory passed without fallback (`colmap-two-groups-final-real-solve.log`). Earlier poor-registration bounded-fallback evidence is retained; no deterministic reconstruction parity is claimed. Source code, private scope/workflow checks and release gates remain authoritative. Accepted task count remains53/95,42 unfinished (17in_progress,25todo); substantial downstream software remains as well as unusable current CUDA driver/hardware acceptance and production admission.

O: actual host/resource/source/CPU/OCR/browser observations. R: user's generic-document/unknowns instruction and preserved specification acceptance. P: above retained results. V: remaining42 exact task acceptances, production model/dependency admission, CUDA/headset and downstream release software/validation remain pending.

## Local functional continuation — 12 October 2026 (O/R/P/V)

O: authored source pixels and actual local Compose services. R: original task acceptance, exact source/actor/revision/workflow and unknown-field abstention. P: local OCR is usable through API-owned document processing with the existing durable queue/worker, source-linked pending review and conditional operator action. PNG and EXIF-rotated JPEG persistence pass in `local-ocr-start-corrected-functional-validation.log`; the actual running queue journey passes in `local-ocr-queued-corrected-functional-journey.log`. Trilingual/multipage OCR passes in `ocr-no-gui-functional-smoke.log`. Disabled country profiles now also abstain from explicit unknown text; five focused checks pass in `country-unknown-functional-validation.log`. The changed contracts/API/ops types and focused lint pass. V: these supersede older statements that no local OCR persistence exists; production/native/model admission, country representative accuracy and unfinished task prerequisites remain unaccepted. Status remains in_progress.
