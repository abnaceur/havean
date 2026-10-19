#!/bin/sh
set -eu
case "${DIGITIZATION_LOCAL_OCR:-false}" in true|false) ;; *) echo 'DIGITIZATION_LOCAL_OCR must be true or false.' >&2; exit 1 ;; esac
case "${DIGITIZATION_LOCAL_CAMERA:-false}" in true|false) ;; *) echo 'DIGITIZATION_LOCAL_CAMERA must be true or false.' >&2; exit 1 ;; esac
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/workspace" -w /workspace node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 node scripts/setup.mjs
sh scripts/prepare-container-config.sh
# Digitalization is paused. Normal startup must not download or start its runners.
docker compose -f compose.yaml build --builder default
docker compose -f compose.yaml up -d --wait
docker compose exec -T api node scripts/identity.mjs
