#!/bin/sh
set -eu
# Run from the repository root against the existing local Compose development stack.
docker compose run --rm --no-deps -e RECONSTRUCT_PROPERTY_DEMO=true tests pnpm exec playwright test tests/e2e/digitization-property-capture-assets.spec.ts --project=desktop
docker compose -f compose.property-capture-assets.yaml run --rm encode
for part in 0 1 2 3; do
  offset=$((part * 12))
  docker compose -f compose.property-capture-assets.yaml run --rm encode -y -ss "$offset" -i /assets/studio-walkthrough.mp4 -t 12 -an -c:v libx264 -crf 18 -bf 0 -g 12 -pix_fmt yuv420p "/assets/part-$part.mp4"
done
docker compose run --rm --no-deps -e RECONSTRUCT_PROPERTY_DEMO=true tests pnpm exec playwright test tests/e2e/digitization-property-reconstruction.spec.ts --project=desktop
