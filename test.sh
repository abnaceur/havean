#!/bin/sh
set -eu
# Only haven-integration resources are reset. The development project is separate.
docker run --rm --user "$(id -u):$(id -g)" -e SETUP_ENV_FILE=.env.integration -e SETUP_GENERATED_DIR=infra/generated/integration -e SETUP_PROJECT_NAME=haven-integration -v "$PWD:/workspace" -w /workspace node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 node scripts/setup.mjs
compose() { docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests "$@"; }
compose down --volumes --remove-orphans
compose build --builder default
compose up -d --wait db identity search cache storage scanner mail api worker web ops proxy
compose exec -T api pnpm exec tsx scripts/fixture-fingerprint.ts evidence/latest-fixture-fingerprint.json
compose exec -T api node scripts/identity.mjs
compose run --rm --no-deps tests "$@"
