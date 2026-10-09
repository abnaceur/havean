## Acceptance
Store immutable asset lineage and input revision. Verified for the supplied first-slice small private document/image scope.

## Implementation
Immutable source sets preserve exact asset version, checksum, bytes, MIME, purpose and input revision. Reservation permits an owner to grant the next exact revision before binding. Grants never carry into another revision. Removal appends a new snapshot, including after grant revocation, without changing old run inputs. SQL168/169 constrain historical reads and source descriptors by exact revision.

## Tests
`flock -n /tmp/haven-integration.lock docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests run --rm --no-deps tests pnpm exec vitest run tests/integration/digitization-revision-authority.test.ts tests/integration/digitization-source-validation.test.ts tests/integration/digitization-workflow.test.ts tests/integration/digitization-schema.test.ts tests/integration/digitization-inputs.test.ts tests/integration/digitization-intakes.test.ts tests/integration/digitization-leases.test.ts tests/integration/outbox.test.ts` — passed.
Logs: validation/revision-coordinator-regressions.log (24 checks), validation/coordinator-platform-regressions.log (10), validation/coordinator-cpu-final.log (69 CPU checks), validation/coordinator-fencing-final.log (six real transport/DB/storage/queue journeys). API/worker types, 348 generated operations, targeted lint and import boundaries pass in validation/coordinator-final-checks-corrected.log.

## Limitations
This task acceptance does not complete the engine. OCR, candidates/review UI, long-outage reconciliation, cancellation delivery, full capture processing, scene/GPU/device/headset and country benchmarks remain separate unfinished tasks. Private renders are privacy-pending and never publication authority.

## Next dependency
Continue HE-C05–C10 and private page/OCR/review pipeline under their exact acceptance gates.

## O
No customer source or original-site parity approval.

## R
Supplied digitization specification, first-slice scope and current exact actor/revision/fencing requirements.

## P
Actual synthetic files, ClamAV, isolated native decoder, PostgreSQL, private S3, Nest API and BullMQ were exercised; no simulated reconstruction.

## V
No external country, GPU reconstruction, scene publication, headset or full-engine approval.

## Earlier implementation history
Historical descriptions below predate this acceptance and are retained with earlier failures.

## Acceptance
Immutable asset lineage and input revision; removing a source must preserve old run inputs. In progress: HE-B04 eligibility and exact-revision grant refinement are unfinished.

## Implementation
`apps/api/src/inventory/digitization/inputs.ts` commits a new immutable source snapshot and matching source bindings in an actor-scoped short transaction. It checks workspace/source versions, source purpose/hash/revision, current media scan status and explicit processing authority. Snapshots contain opaque asset IDs, hash, byte count and pending decoder state, never object keys or buffered bytes. Removal creates an empty next revision without updating old bindings or runs. Processing eligibility remains false until decoder/runner integration.

## Tests
Targeted API typecheck and lint pass (`input-checks.log`, `input-lint.log`). `flock -n /tmp/haven-integration.lock docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests run --rm --no-deps tests pnpm exec vitest run tests/integration/digitization-inputs.test.ts tests/integration/digitization-source-validation.test.ts tests/integration/digitization-source-scan.test.ts tests/integration/outbox.test.ts` passed all five tests (exit 0). The source revision test uses actual stored PNG bytes, authoritative validation and old run/binding preservation after removal. `input-integration.log` retains results.

## Limitations
The new intake/listing binding controllers are registered through the existing API; browser source-binding UI remains unfinished. Explicit owner grants are revision-specific; no automatic grant carryover is added. Current historical-binding private access is conservative and still requires exact-revision RLS refinement before this task is complete. A pre-scanned fixture must not be confused with engine scan acceptance. No processing or publication is enabled by a source snapshot.

## Next dependency
HE-B03/B04, exact revision access, B06, C01 and owner-specific source/grant adapter.

## O
No customer source used.

## R
Immutable revision/provenance and explicit evidence authority.

## P
Real DB/object-storage source validation and revision test passes; input image is a synthetic fixture.

## V
No end-to-end source eligibility, OCR or publication acceptance.

## API bindings — 7 October 2026
P: `input-binding-integration.log` passes six actual DB/storage/intake checks. POST asset-bindings and DELETE binding preserve immutable parent input sets, retain all unaffected server-side source metadata, validate new source bytes outside SQL, and recheck current grant/scan/version inside the short commit. Same-key replay returns the original receipt; changed body conflicts; stale edit and another agency deny. Removal snapshots remain [one, empty, one, empty], while an old run still references revision one. No body/object key is serialized. Canonical response/schema generators were extended before regenerating SDK/OpenAPI; 343 operations at that intermediate snapshot, then 344 after the runner-start port. API types, generated checks and targeted lint pass. O: synthetic already-scanned PNG metadata only. R: immutable inputs and checked inventory-owned transitions. V: no private owner-grant carryover, complete HE-B04 decoder eligibility, exact-revision access refinement, OCR or full HE-B05 completion.
