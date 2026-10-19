#!/bin/sh
set -eu
# Run against the enabled local Compose CPU/GPU development stack.
docker compose run --rm --no-deps -e RECONSTRUCT_2BHK_DEMO=true tests pnpm exec playwright test tests/e2e/digitization-2bhk-assets.spec.ts --project=desktop
sh scripts/demo/generate-2bhk-clips.sh
docker compose run --rm --no-deps -e RECONSTRUCT_2BHK_DEMO=true tests pnpm exec playwright test tests/e2e/digitization-2bhk-reconstruction.spec.ts --project=desktop
