# HE-B03 — Done: authoritative finalization and private quarantine

## Acceptance
Finalize with authoritative byte/MIME/object checks and quarantine.

## Implementation
Existing small uploads reuse scanned media rows; `source-validation.ts` compares actual bounded S3 bytes, declared size/type and hash, retaining explicit isolated-decoder requirements. Capture-specific finalization lists authoritative multipart parts, validates ordering/size, assembles the object, streams SHA-256 and a bounded container header, then commits an immutable private quarantine receipt and existing transactional outbox event. No provider key is accepted from a client. No SQL transaction spans object transfer. The whole completion transfer has a 120-second deadline; the specific JSON BFF has a bounded 180-second retry policy and a 2048-byte streaming metadata cap. Ordinary BFF timeout/CSRF remain unchanged.

`capture-finalization.ts`, `capture-content.ts`, `multipart.ts`, `capture.ts`, capture controllers/contracts/BFF and migration 166-digitization-capture-quarantine-receipts.sql implement this boundary. Matching completed receipts replay; changed idempotency bodies conflict. A lost DB commit/incorrect checksum after assembly can recover through NoSuchUpload and authoritative stored-object checks. Resume exposes `completionRequired: true`, without claiming integrity/decoder approval. Receipts always return `processingEligible: false`. MIME declaration parsing is a container check, not ffprobe, ClamAV or provenance approval.

## Tests
`flock -n /tmp/haven-integration.lock docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests run --rm --no-deps tests pnpm exec vitest run tests/integration/digitization-capture-finalization.test.ts tests/integration/digitization-source-validation.test.ts`

Passed four tests on 7 October 2026, exit 0: `validation/capture-intent-size-final.log`. Actual SeaweedFS/gateway rejects an altered signed Content-Length with 403. A deliberately forged stored part using the isolated fixture's storage credential exceeds the capture intent and the API rejects completion with 422/no receipt. QuickTime declaration with actual MP4 bytes rejects; hash mismatch/lost-commit retry, one receipt/outbox, actor denial and immutable replay pass. Small-source forged MIME/size/over-limit inputs cannot become eligible. Initial oversize fixture incorrectly expected the signed gateway to permit a changed length; the actual stronger denial is retained and the corrected fault injection proves the second server boundary.

The preceding six-file scope/schema/command suite passes 13 checks (`capture-quarantine-integration-retry.log`); final recovery/capture regression passes four (`capture-resume-final.log`). Metadata interruption and size/CSRF checks pass three BFF units, with private stream errors sanitized (`capture-completion-interruption.log`). API/ops types, targeted lint and canonical generated contracts pass; 339 operations. Migration applied to the fresh isolated stack and development upgrade. Development upgrade first required existing marketplace migration 164 through the extension owner; its exact DO and subsequent 165/166 application are retained. Another concurrent marketplace migration uses prefix 166; the existing migrator keys full filenames and both apply without modifying historical migrations.

## Limitations
HE-B04 owns asynchronous malware/isolated decoding and eligible input promotion; HE-B05 owns input bindings. This task never publishes, opens a deed, or claims a complete job/processing pipeline. Test capture is the repository synthetic 177685-byte movie, not a real reconstruction dataset or a 2 GiB load benchmark. No large-capture throughput claim. The host exhausted file-watcher instances during fresh browser startup. Focused integration used a temporary isolated gateway override disabling config file watching with the unchanged actual routing; browser/full startup acceptance remains unverified. No shared project was reset or host watcher limit changed.

## Next dependency
HE-B04 asynchronous scan/decode promotion, then HE-B05 input bindings.

## O
Repository synthetic movie and forged isolated metadata only; no customer evidence.
## R
Supplied stored-object, separate large-upload, quarantine and independent-review requirements.
## P
Actual PostgreSQL/SeaweedFS/signed gateway with fault injection, bounded streamed integrity and durable quarantine.
## V
Byte integrity/quarantine acceptance only; no malware/codec approval, OCR, publication, GPU/device or full-engine completion.

Final disconnect hardening: metadata reads have a five-second deadline and close on client abort before forwarding. Four BFF tests pass (`capture-disconnect-final.log`), including a stalled stream terminated by disconnect with no partial API request. Targeted lint passes. This adds one meaningful test after the 51-unit aggregate run; no new aggregate count is claimed.
