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
