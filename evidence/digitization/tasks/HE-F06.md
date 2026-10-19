## Acceptance
Add capture guidance and local quality feedback.
Accepted after HE-F05 and HE-F03. Minimum: Blur guidance shown from real frame input without fabricated coverage percentage.

## Implementation
Existing capture recording/upload flow samples actual locally decoded video frames on a bounded128px canvas every600ms. Laplacian variance and brightness are actual pixels, labeled advisory. Low texture/blur and low light prompt slower recording/refocusing/lighting; doorway/overlap/privacy guidance accompanies them. Coverage remains unknown, no percentage, camera pose/depth/dimensions guessed. User-selected recorded/uploaded clips can preview locally through revocable blob URLs; local samples are never uploaded or used to mutate dataset/publication decisions. API owns server quality selection. Interval/canvas/blob URL/media stream resources dispose on stop/unmount.

## Tests
`flock -n /tmp/haven-integration.lock docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests run --rm --no-deps tests pnpm exec playwright test tests/e2e/digitization-guidance.spec.ts tests/e2e/digitization-recording.spec.ts --project=desktop --project=mobile` passes all six actual browser checks in capture-guidance-real-browser.log. Desktop/mobile self-authored YUV input streams through real browser getUserMedia and canvas. Actual variance0, positive sampled video timestamp and blur guidance are observed; coverage remains unknown and no percentage is present. Four recording/native upload regressions continue through real session/multipart/gateway/S3 quarantine completion after local preview integration. No physical-camera evidence.
`docker compose exec -T api pnpm --filter @haven/ops typecheck` passes in capture-guidance-types.log.
`docker compose exec -T api pnpm lint` passes lint/import boundaries in capture-guidance-final-lint.log.
No new API contracts, database changes or server selection changes; accepted HE-F03 server real frame quality evidence remains unchanged.

## Limitations
Advisory threshold is not country/device calibrated; flat texture can resemble blur. Local pixels cannot prove coverage or reconstruction suitability. Actual server frame selection remains HE-F03. No customer/device/GPU/human/parity/production or full-engine claim.

## Next dependency
HE-F07 actual training privacy exclusions/masks and reconstruction.

## O
Self-authored raw YUV/test video and synthetic CI metadata.

## R
Preserved architecture, Abu Dhabi, original specification and no invented measurements.

## P
Actual local frame sampling and ongoing browser verification.

## V
no country/device/human/parity or whole-engine claim.
