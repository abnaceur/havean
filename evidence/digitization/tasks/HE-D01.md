## Acceptance
Implement native PDF text/raster fallback and orientation. Verified under the supplied small-document/image first-slice scope.

## Implementation
Checksum-pinned PDFium renders real native/scanned PDF pixels with upright crop/rotation transforms and Unicode native glyph boxes. Invisible/cropped spans abstain; scanned pages request OCR rather than invented native text. Mandatory isolated decoder and source budgets guard parsing. API current-source transfer and authenticated private commits preserve checksum/profile/version/coordinate lineage.

## Tests
Actual rotated/cropped synthetic scanned rectangles align transformed evidence with rendered PNG pixels. Native glyph boxes enclose source ink for all four right-angle rotations. Cropped native spans require OCR. Real authenticated scoped PDF input produces a committed private rendered page.
`./test-processing.sh` — passed.
`./test-runner-protocol.sh` — passed.
Logs: validation/coordinator-retry-final.log (seven real protocol/API/DB/S3/queue journeys), validation/coordinator-recovery-scoped-final.log (six recovery/fencing journeys), validation/coordinator-cpu-final.log (69 CPU checks), validation/coordinator-retry-checks.log (API/worker types, 348 operations, targeted lint and boundaries).

## Limitations
No full engine, OCR adapter, country benchmark, GPU reconstruction, device/headset or publication acceptance. Source renders remain private/privacy-pending. Expired or revoked processing authority fails closed. Failed queue deliveries require supported recovery/operator action after their cap; polling does not silently reset them.

## Next dependency
HE-C07–C10 and HE-D02 onward, with real scoped evidence and independent publication gates.

## O
Synthetic sources only; no customer originals or parity approval.

## R
Supplied durable execution, recovery, isolation and coordinate requirements.

## P
Actual CPU decoder, real process kill, database, private storage, HTTP and BullMQ, with retained failures.

## V
Country extraction, OCR review, reconstruction and headset/full-engine approval remain unverified.

## Earlier implementation history
## Acceptance
Native PDF text inspection, bounded raster fallback and upright orientation transforms. In progress: authenticated execution/source delivery and actual OCR integration remain unfinished.

## Implementation
`pdf_raster.py` uses checksum-pinned pypdfium2 5.14.0 / PDFium 156.0.8076.0 without V8/XFA. It renders genuine PDF page pixels at the versioned 150-dpi profile, preserves crop/rotation transforms and native source text, and emits private checksum-bound previews. `source_cli.py` rejects preview substitution and path/symlink traversal. Decoder processes use a trusted module directory, no inherited runner credentials and fixed resource budgets.

## Tests
`./test-processing.sh`: 47 passed after software-version metadata checks (`validation/raster-cpu.log`). Real rotated and cropped synthetic PDF rectangles map source coordinates to matching PNG pixels. Encrypted, expanded-raster and unsupported UserUnit inputs fail; repeated private preview writes verify exact checksums. A job-local pypdf.py cannot shadow the decoder dependency. The later execution suite extends these checks.

## Limitations
Rasterization does not perform OCR. Native glyph boxes are supplied by PDFium and transformed to upright page coordinates; cropped or invalid spans abstain. No OCR tokens or source-linked UI acceptance yet. Page budget is 50 / total raster budget 30 MP; source cap remains 20 MiB. Full current-run source grant selection and durable preview storage remain unfinished.

## Next dependency
HE-C03/C04 authenticated source/execution integration, HE-D02 real multilingual OCR.

## O
No customer originals inspected.

## R
Supplied source coordinate, private evidence and decoder budget requirements.

## P
Actual PDFium pixels and isolated subprocesses on authored synthetic fixtures.

## V
No OCR benchmark, legal authentication, publication or visual parity approval.

## Native evidence and confinement continuation — P
`./test-processing.sh` passed 65 actual CPU tests (`validation/decoder-isolation-final.log`, 8.80 seconds). Native line boxes enclose the rendered source ink across all four right-angle rotations, preserve source Unicode and permit generic extraction of the explicitly labeled leading-zero unit identifier. Fully cropped text supplies no guessed evidence and requires OCR. A real decoder child can read/write its own workspace but cannot read a sibling secret, `/proc/self/environ`, use TCP/UDP, start a subprocess or create a symlink escape. Linux Landlock ABI >=6 and seccomp are mandatory; unsupported hosts fail closed. Real Node/Python source transfer and isolated rasterization rerun passes one check (`validation/runner-protocol-isolated.log`). These component checks do not constitute a private OCR draft or complete HE-D01 acceptance.
