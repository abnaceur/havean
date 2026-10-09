# HE-B02 — Resumable capture sessions and direct scoped parts

## Acceptance
Capture-specific persisted sessions reserve at most 2 GiB per clip and 20 GiB per digitization. Current agency/resource/creator/version/state checks precede bounded signed part grants. Browser sends binary parts through the existing PUT-only gateway to private SeaweedFS; neither ordinary BFF arrayBuffer handling nor small-upload caps are increased. Transfer/provision/list/abort work occurs outside short actor transactions. Missing upload origin fails closed; production origin requires HTTPS.

## Implementation
Migration 131-digitization-capture-uploads.sql; capture.ts, capture-controller.ts and multipart.ts under apps/api/src/inventory/digitization; digitization-capture.ts schemas, generated operations/responses/OpenAPI; compose.digitization.yaml development upload origin. Inventory owns upload records/RLS and guarded transitions. Reservations, immutable identity, quota, receipts, uploaded-parts listing, current-authority part grants and cancellation/abort are durable. Provisioning races abort the losing upload. Existing small signed intents remain available without relaxed limits.

## Tests
`flock -n /tmp/haven-integration.lock docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests run --rm --no-deps tests sh -c 'pnpm db:migrate && pnpm exec vitest run tests/integration/digitization-capture.test.ts tests/integration/digitization-multipart.test.ts'`
Passed 3 checks on 6 October 2026; capture.log retained. Actual controller/DB/storage/gateway creation, stable receipt, changed-body conflict, denied cross-agency read, stale/out-of-range grants, direct 8 MiB upload, new-client resume/list and cancellation receipt with storage abort pass. Ten 2 GiB reservations exhaust the 20 GiB quota before storage work; no synthetic large-byte throughput result is claimed. Typechecks, API build, lint/boundaries and generated-contract checks pass.

## Limitations
Capture finalization/scan/decoder eligibility is HE-B03/B04, guided browser recording HE-F, orphan/expiry reconciliation HE-K02. No 2 GiB or concurrency performance measurement. External upload capability has a maximum ten-minute residual lifetime; abort invalidates active multipart work, and subsequent processing rechecks current authority. A crash during provisioning may leave an uncommitted multipart for K02 cleanup. Concurrent marketplace work independently allocated a different 131 filename; the migration runner keys full names and both additive independent migrations applied successfully. Applied files are preserved.

## Next dependency
HE-B03 authoritative finalization and asynchronous quarantine validation; HE-B04 scan/raster isolation and HE-B05 immutable source revisions.

## O
No property capture.
## R
Supplied transport, transaction and quota requirements.
## P
Real isolated PostgreSQL/private SeaweedFS/gateway with generated fixture bytes and actual access/version failures.
## V
No production, large-input load, reconstruction or device acceptance.
