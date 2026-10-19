#!/bin/sh
set -eu
# Remove this pause only when the product explicitly resumes engine access.
echo 'Digitalization is paused; processing runners are not started.' >&2
exit 1
case "${1:-}" in ''|--build) ;; *) echo 'Usage: ./dev-ocr.sh [--build]' >&2; exit 1 ;; esac
# Opt-in local development only. Requires ./dev.sh and the checksum-pinned OCR
# investigation cache; never provisions a model provider or production profile.
docker compose ps --status running --services | rg -qx api || { echo 'Start the development application with ./dev.sh first.' >&2; exit 1; }
docker image inspect haven-processing-cpu:1.0.0-cpu-v4 >/dev/null
if [ "${1:-}" = --build ] || ! docker image inspect haven-ocr-worker:3.3.3-clean-cpu-no-gui-investigation-v2 >/dev/null 2>&1; then
  docker compose -p haven-ocr-no-gui-investigation -f compose.ocr-no-gui.yaml build --builder default
fi
if [ "${1:-}" = --build ] || ! docker image inspect haven-processing-ocr:3.3.3-local-cpu-v1 >/dev/null 2>&1; then
  docker compose -f compose.yaml -f compose.digitization.yaml -f compose.ocr-development.yaml build --builder default processing-cpu
fi
docker compose -f compose.yaml -f compose.digitization.yaml -f compose.ocr-development.yaml up -d --no-deps --wait --wait-timeout 60 api processing-cpu
