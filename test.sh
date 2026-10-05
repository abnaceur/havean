#!/bin/sh
set -eu
# Remove reports from previous runs before any operation can fail.
docker run --rm -e HAVEN_HOST_UID="$(id -u)" -e HAVEN_HOST_GID="$(id -g)" -v "$PWD:/workspace" -w /workspace node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 node scripts/reset-ci-evidence.mjs
# Only haven-integration resources are reset. The development project is separate.
docker run --rm --user "$(id -u):$(id -g)" -e SETUP_ENV_FILE=.env.integration -e SETUP_GENERATED_DIR=infra/generated/integration -e SETUP_PROJECT_NAME=haven-integration -v "$PWD:/workspace" -w /workspace node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 node scripts/setup.mjs
sh scripts/prepare-container-config.sh infra/generated/integration
compose() { docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests "$@"; }
diagnose() {
  result=$?
  if [ "$result" != 0 ]; then
    compose ps -a > evidence/ci/startup.log 2>&1 || true
    compose logs --no-color --tail 100 db identity storage scanner api worker web ops >> evidence/ci/startup.log 2>&1 || true
    docker run --rm -e HAVEN_SANITIZE_ENV=.env.integration -v "$PWD:/workspace" -w /workspace node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 node scripts/sanitize-ci.mjs || rm -f evidence/ci/startup.log
  fi
  exit "$result"
}
trap diagnose EXIT
compose down --volumes --remove-orphans
compose build --builder default
compose up -d --wait db identity search cache storage scanner mail api worker web ops proxy
compose exec -T api pnpm exec tsx scripts/fixture-fingerprint.ts evidence/latest-fixture-fingerprint.json
compose exec -T api node scripts/identity.mjs
compose run --rm --no-deps tests "$@"
