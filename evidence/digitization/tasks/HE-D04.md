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
