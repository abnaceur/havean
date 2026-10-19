## Acceptance
Add supported browser recording/clip upload and fallback.
Accepted after HE-F04 and HE-F01. Minimum: Supported browser records/uploads; unsupported MIME offers native upload.

## Implementation
Existing room capture checklist exposes explicit MP4 MediaRecorder capability detection and native MP4/MOV file input. No compatible recording MIME/camera yields native upload. Recording requests video only, rear-camera preference, stops within60seconds/10MiB and releases all tracks on stop/error/unmount. User provides source rights and authority; unknown camera pose/depth is retained as unknown. Direct signed8MiB multipart parts use the existing scoped API/gateway, checksum metadata completion uses the existing BFF, and the receipt remains private/quarantined. Uploaded clips must be linked to rooms by the user. No scene/measurement inferred.

## Tests
`flock -n /tmp/haven-integration.lock docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests run --rm --no-deps tests pnpm exec playwright test tests/e2e/digitization-recording.spec.ts --project=desktop --project=mobile` passes all four checks in clip-upload-authority-fixed-browser.log: actual fake-camera browser encoded MP4 recording and complete real session/gateway/S3/private quarantine upload; unsupported MIME capability presents native file upload and uploads real project-generated MP4 bytes. Both desktop and mobile projects pass; camera tracks and video srcObject are cleared. Rights/authority keep upload disabled until supplied. Initial fixture omitted intake authorityConfirmed, causing four pre-upload failures; corrected. Synthetic fake-camera browser sources are not physical device/country measurements.
`docker compose exec -T api pnpm --filter @haven/ops typecheck` passes in clip-upload-final-types.log, after the initial typeof capability detection correction.
`docker compose exec -T api pnpm lint` passes lint/import boundaries in clip-upload-final-lint.log.
No backend/schema changes; existing147/48 units and380 contracts from accepted HE-G03 remain unchanged.

## Limitations
This browser flow caps clips at10MiB and recording60seconds; large2GiB multipart backend is separate and unchanged. No physical device/camera/headset test, actual customer source, human/parity approval or automatic malware/decoder/publication clearance. Native capture receipt only checks source transfer/container and remains processingEligible=false.

## Next dependency
HE-F06 local quality/guidance and HE-F07 masks.

## O
Synthetic fake-camera/device assets and CI actors only.

## R
Original specification, current private upload/capture architecture, Abu Dhabi and missing-data rule.

## P
Local recorded code/type checks and actual browser attempts.

## V
No customer/hardware/throughput/human/parity/production or whole-engine claim.
