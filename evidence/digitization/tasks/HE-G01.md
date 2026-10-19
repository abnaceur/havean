## Acceptance
Validate genuine panorama inputs and create tiers. Accepted after HE-F01.
Minimum: Arbitrary 2:1 normal photo is flagged for review rather than auto-certified panorama.

## Implementation
Private panorama candidate profile validates decoded JPEG/PNG, single-frame bounds, exact 2:1 dimensions, minimum1024 width, allowed orientation, byte/pixel/time/scratch budgets in the existing Landlock/seccomp image child. Produces deterministic1024/2048/4096 PNG tiers only up to source width; metadata is stripped. Dimensions establish a candidate only: genuinePanoramaConfirmed=false, reviewRequired=true and explicit provenance/projection review reason persist for every tier. Quarter-turn/reflected, undersized and non2:1 sources fail closed. No image heuristics or EXIF claims certify capture truth. Source/current actor/input/version/lease checks and fresh source scan/hash precede private artifact commit. Tier checks bind dimensions, exact filenames and hashes. Replay retains one receipt; cleanup handles tier files. No public tour or plan transform is created.

## Tests
`docker compose -f services/property-processing/compose.tests.yaml run --rm --no-deps cpu python -m pytest -p no:cacheprovider -q tests` passes87 checks in panorama-final-full-cpu.log, including six actual confined panorama checks at2048 and4096 widths, pixel colors, all tier sizes, hashes, stripped private EXIF, deterministic replay and invalid projections/orientations.
`./test-runner-protocol.sh panorama` passes one actual API/database/S3/Clam/isolated-worker journey in panorama-private-corrected-workflow.log: arbitrary ordinary2:1 photo produces two private/pending unconfirmed tiers, no plan pages, awaiting-review run, idempotent replay and foreign scope/wrong fence denial.
Full units142/46, nine types, lint/boundaries and374-operation contracts pass in panorama-full-units.log, panorama-all-types.log, panorama-final-lint.log and panorama-contracts-check.log. The initial integration caught missing ocrAvailable; corrected result passes. Initial full suite85passed/1failed due to stale exact capability list; final87passes after adding the new profile to that exact expectation. Failure logs retained.

## Limitations
Candidate validation is not capture certification. Actual genuine panorama provenance must be reviewed independently before approved publication. Tests are self-authored ordinary flat-color images and synthetic database scan metadata; actual bytes are freshly Clam-scanned/decoded. No customer panorama, headset, spherical seam quality, performance, human approval or production claim. Legacy tour/media serialization is preserved.

## Next dependency
HE-G02 graph/hotspots, HE-G03 image selection and subsequent independently gated review/publication.

## O
Self-authored synthetic PNG bytes; no authorized customer or actual review evidence.

## R
Preserved supplied specification, Abu Dhabi priority and fixed-empty document field rule.

## P
Actual confined decoders, private workflow, retained builds and tests described above; no new SQL.

## V
No parity approval, customer/device measurement, production or whole-engine completion.
