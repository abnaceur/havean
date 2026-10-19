# HE-D03 — decimal, unit, identifier and calendar normalization (accepted 12 October 2026)

## Acceptance
Implement normalization for decimals, units, IDs and calendars. Exact minimum: `184,20 m²` normalizes correctly; leading-zero ID stays string. HE-A03 and HE-D02 are both accepted. Original acceptance and minimum are unchanged.

## Implementation
The existing confined worker normalizes declared French/English/Arabic separators and Arabic/extended Arabic digits using Decimal strings, retaining scale, original quotes, evidence boxes and area basis. Supported source units map explicitly to m2/ft2/ha; normalization does not infer a different unit or area basis. Identifiers remain strings, including leading zeros and suffixes. Dates retain explicit Gregorian/Hijri/unknown calendar and year/month/day precision without automatic calendar conversion or ambiguous day/month guessing.

The API independently rechecks supported document quantities against the quoted source and rejects changed amounts, units or area basis. Canonical contracts reject numeric quantities/IDs, invalid date precision and impossible Gregorian dates. Existing source-linked OCR/persistence was accepted under HE-D02. No additional runtime change was necessary: the previous D03 blocker was the unfinished OCR prerequisite.

Implementation: `services/property-processing/property_processing/facts.py`, `apps/api/src/inventory/digitization/document-fact-values.ts`, `apps/api/src/inventory/digitization/document-fact-projection.ts`, `packages/contracts/src/digitization.ts`.

## Tests
Three current CPU functional cases pass in `evidence/digitization/normalization-minimum-cpu-functional.log`: exact leading-zero identifier and source quantity, French `184,20 m²` normalization with preserved source/basis, and calendar/precision normalization plus ambiguous/invalid-date refusal. The current repository modules and selected test file are mounted read-only into the existing pinned Compose test image; no dependency download or rebuild was needed.

```sh
docker compose -p haven-normalization-tests -f services/property-processing/compose.tests.yaml run --rm --no-deps -v "$PWD/services/property-processing/property_processing:/opt/processing/property_processing:ro" -v "$PWD/services/property-processing/tests/test_facts.py:/opt/processing/tests/test_facts.py:ro" cpu python -m pytest -q -p no:cacheprovider tests/test_facts.py -k 'identifier_preserves_zeros or mixed_sources_preserve or dates_keep_explicit'
```

Three API/contract functional cases pass in `evidence/digitization/normalization-minimum-api-functional.log`: exact decimal and leading-zero string shapes, calendar/precision validation, and independent French/Arabic source-quantity validation with amount/unit/basis tamper refusal.

```sh
docker compose exec -T api pnpm exec vitest run tests/unit/digitization-contracts.test.ts tests/unit/digitization-document-fact-projection.test.ts -t 'keeps decimal quantities and leading-zero|dates preserve explicit|validates exact multilingual decimal'
```

Other tests were deliberately deselected. No broad suite, repeated OCR-model inference, GPU/VR check or new implementation-mirroring tests were run. HE-D02's final real three-language OCR and image-source evidence remains in `ocr-production-final-functional-journey.log`.

## Limitations
These are authored normalization and API-boundary fixtures, not representative country/property accuracy or ownership verification. Hijri dates retain their supplied calendar and bounded fields; no observational calendar conversion is claimed. Missing or ambiguous facts require review. Generic/date extraction coverage and country templates retain their separate tasks. No new production deployment or full-engine release is claimed.

## Next dependency
HE-D04 generic anchored extraction with abstention is now unblocked by D03; it retains its own acceptance and minimum test. Engine56/95 accepted,37 non-VR unfinished and2 VR paused.

## O
Current repository code, authorized authored French/Arabic/English text and source boxes, actual Compose functional results. No customer documents or invented accuracy measurements.

## R
Preserved supplied specification and exact D03 minimum, string quantities/IDs, original source evidence, explicit calendars and unknown-value abstention. User requested the next task with minimum functional validation.

## P
Six selected existing functional cases pass. Both prerequisites are accepted. Normalization already implemented; task evidence and ledgers updated without unnecessary runtime edits.

## V
D03 is accepted; other extraction, country calibration, GPU, physical-device, human/parity and release gates remain independent. GPU validation stays deferred; VR stays paused.

## Historical evidence (superseded status and prerequisite notes)

## Acceptance
Normalize decimal quantities, units, identifiers and calendars without floating-point persistence. Task remains in progress: real OCR dependency HE-D02 is unfinished.

## Implementation
`services/property-processing/property_processing/facts.py` uses Decimal strings, declared locale separator rules, Arabic/extended Arabic digits, exact identifier strings, explicit calendars and date precision. Ambiguous quantities/dates abstain. Canonical Zod contracts now reject calendar/precision mismatch and impossible Gregorian dates.

## Tests
`./test-processing.sh` passes 42 real CPU pytest checks, including 17 generic normalization/extraction checks. Exact output `184.20`, preserved `00123-A`, Hijri month precision and Gregorian leap-day validation are exercised. Log: `evidence/digitization/validation/facts-cpu.log`.

## Limitations
No enabled OCR model, country benchmark or end-to-end source candidate persistence. A standalone parser is not an OCR draft acceptance result.

## Next dependency
HE-D02 real OCR; HE-D04 extraction integration.

## O
No original customer documents inspected.

## R
Supplied specification requires unknown values and decimal persistence.

## P
Synthetic text and evidence-box fixtures; passing isolated Python checks.

## V
No country accuracy or publication approval.

## Local functional continuation — 12 October 2026 (O/R/P/V)

O: authored source pixels and actual local Compose services. R: original task acceptance, exact source/actor/revision/workflow and unknown-field abstention. P: local OCR is usable through API-owned document processing with the existing durable queue/worker, source-linked pending review and conditional operator action. PNG and EXIF-rotated JPEG persistence pass in `local-ocr-start-corrected-functional-validation.log`; the actual running queue journey passes in `local-ocr-queued-corrected-functional-journey.log`. Trilingual/multipage OCR passes in `ocr-no-gui-functional-smoke.log`. Disabled country profiles now also abstain from explicit unknown text; five focused checks pass in `country-unknown-functional-validation.log`. The changed contracts/API/ops types and focused lint pass. V: these supersede older statements that no local OCR persistence exists; production/native/model admission, country representative accuracy and unfinished task prerequisites remain unaccepted. Status remains in_progress.
