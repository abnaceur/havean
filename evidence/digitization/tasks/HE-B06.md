## Acceptance
Add source preview access and public derivative stripping. Unauthorized preview denies; public photo variants contain no source GPS EXIF.

## Implementation
An additive server-session API/BFF preview route resolves only scoped committed image artifacts. Current agency, target and exact source-read/revision RLS is checked before storage and again before response. The browser supplies opaque workspace/artifact IDs and receives PNG bytes without provider keys. Reads are capped at 32 MiB and enforce stored length, committed checksum and PNG signature; mismatches or changed authority cannot be served. Preview responses are private/no-store with explicit image MIME and sandbox/nosniff headers. Binary SDK/OpenAPI schemas preserve the existing server-session bridge.
Existing authoritative MediaController ingest scans the actual original, rotates/resizes through sharp and regenerates display/thumbnail WebP without metadata; no second public publication authority is introduced. This reused port preserves document privacy and explicit visibility/purpose.

## Tests
`./test-runner-protocol.sh` — eight actual protocol/API/DB/S3/queue checks pass in validation/source-preview-derivatives-final.log. A committed real CPU PNG is readable with current scope; a foreign actor and wrong workspace deny, tampering with same-length stored preview fails checksum. Actual source JPEG includes GPS directory 0x8825 and private location EXIF; real media ingest/ClamAV writes both public variants with EXIF/XMP/IPTC/private text absent.
`docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T api sh -c 'pnpm lint && pnpm typecheck && pnpm contracts:check && pnpm license:check && pnpm test:unit && pnpm task:validate'` — passed full lint/boundaries, nine workspace types, 352 canonical operations, all 114 units and license/ledger checks in validation/preview-workspace-final-gates.log.
Initial preview test expected 404 where a missing active foreign agency correctly denies 403 (source-preview-runner-initial.log); corrected denial expectation. Initial OpenAPI conversion of a new Blob route was missing the explicit binary registry (source-preview-initial-checks.log); registered as image/png, regenerated and checked.

## Limitations
Preview supports committed private PNG source renders. Uncommitted originals, arbitrary storage keys, SVG/model output, extraction review/publication and advanced video/GPU previews remain separate work. Derived public photos are metadata-stripped; independent package/privacy approval still applies to engine publication. No full-engine or device/headset acceptance.

## Next dependency
HE-D02 onward, plan/source editor and independent artifact/publication review.

## O
Only authored synthetic image/GPS fixtures; no customer locations or original parity approval.

## R
Scoped source-read authority, private originals, public GPS removal and credential-free browser previews.

## P
Actual committed CPU renders, actor-scoped PostgreSQL/S3 reads, same-length tampering denial and real ClamAV/sharp public variants.

## V
No country OCR, public engine package, reconstruction, headset or production approval.
