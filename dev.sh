#!/bin/sh
set -eu
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/workspace" -w /workspace node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 node scripts/setup.mjs
docker compose build --builder default
docker compose up -d --wait
docker compose exec -T api node scripts/identity.mjs
