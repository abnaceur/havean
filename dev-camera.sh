#!/bin/sh
set -eu
# Remove this pause only when the product explicitly resumes engine access.
echo 'Digitalization is paused; processing runners are not started.' >&2
exit 1
case "${1:-}" in ''|--build) ;; *) echo 'Usage: ./dev-camera.sh [--build]' >&2; exit 1 ;; esac
docker compose ps --status running --services | rg -qx api || { echo 'Start the development application with ./dev.sh first.' >&2; exit 1; }
if [ "${1:-}" = --build ] || ! docker image inspect haven-processing-ocr:3.3.3-local-cpu-v1 >/dev/null 2>&1; then
  ./dev-ocr.sh "${1:-}"
fi
if [ "${1:-}" = --build ] || ! docker image inspect haven-colmap-runtime:3.10-source-cpu-v1 >/dev/null 2>&1; then
  docker compose -f compose.reconstruction-runtime.yaml build --builder default colmap-runtime
fi
if [ "${1:-}" = --build ] || ! docker image inspect haven-processing-camera:3.10-local-cpu-v1 >/dev/null 2>&1; then
  docker compose -f compose.yaml -f compose.digitization.yaml -f compose.ocr-development.yaml -f compose.camera-development.yaml build --builder default processing-cpu
fi
docker compose -f compose.yaml -f compose.digitization.yaml -f compose.ocr-development.yaml -f compose.camera-development.yaml up -d --no-deps --wait --wait-timeout 60 api processing-cpu
