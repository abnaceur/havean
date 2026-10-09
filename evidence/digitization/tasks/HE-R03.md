# HE-R03 — Actual SeaweedFS multipart transport

## Acceptance
apps/api/src/inventory/digitization/multipart.ts; infra/routes.yml PUT-only private capture gateway; tests/integration/digitization-multipart.test.ts; docs/adr/digitization-multipart.md. Actual pinned adapter create/list/resume/complete/head/streaming checksum/abort behavior checked through the externally reachable existing gateway shape. No legacy buffered upload limit is increased.

## Tests
`flock -n /tmp/haven-integration.lock docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests run --rm --no-deps tests pnpm exec vitest run tests/integration/digitization-multipart.test.ts`
Passed 1 meaningful real adapter round-trip on 6 October 2026; retained multipart.log. A persisted 8 MiB first part survives a new client, wrong byte total is rejected, second part completes, streaming whole-object SHA-256 equals known bytes, oversized read is denied, unsigned gateway upload receives 403, abort/list/head confirm abandoned upload cleanup. Initial test package resolution and manually changed fetch Host failures were corrected; no failed run is counted as acceptance.

## Limitations
HE-B02 product session/authority/quota endpoints, HE-B03 checksum/MIME quarantine, HE-B04 asynchronous scan, HE-K02 cleanup scheduler and measured large-input load tests remain required. This task is the spike, not capture readiness. Gateway exposes only PUT under capture keys; S3 validates the short-lived signature.

## O
No property capture.
## R
Pinned SeaweedFS adapter and supplied dedicated large-upload requirement.
## P
Real private S3/gateway round trip using deterministic test bytes; objects/multiparts cleaned.
## V
No 2 GiB throughput, production origin, reconstruction or device acceptance.

## Next dependency
Continue the next scoped engine task documented above; the full release is unfinished.

## Implementation
Private multipart adapter and PUT-only existing gateway route as described above.
