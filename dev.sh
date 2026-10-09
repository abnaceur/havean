#!/bin/sh
set -eu
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/workspace" -w /workspace node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 node scripts/setup.mjs
sh scripts/prepare-container-config.sh
mkdir -p services/property-processing/.wheels
PROCESSING_BUILD_UID="$(id -u)" PROCESSING_BUILD_GID="$(id -g)" docker compose -f services/property-processing/compose.tests.yaml run --rm wheel-download
docker compose -f compose.yaml -f compose.digitization.yaml build --builder default
docker compose -f compose.yaml -f compose.digitization.yaml up -d --wait
docker compose exec -T api node scripts/identity.mjs
