#!/bin/sh
set -eu
# Independent CPU lane; it never resets or connects to haven-integration resources.
command -v flock >/dev/null 2>&1 || { echo 'flock is required for CPU processing tests' >&2; exit 1; }
exec 9>/tmp/haven-processing-tests.lock
flock -n 9 || { echo 'haven-processing-tests is already in use' >&2; exit 1; }
mkdir -p services/property-processing/.wheels
export PROCESSING_BUILD_TARGET=cpu-tests
export PROCESSING_BUILD_UID="$(id -u)" PROCESSING_BUILD_GID="$(id -g)"
compose() { docker compose -f services/property-processing/compose.tests.yaml "$@"; }
compose run --rm wheel-download
compose build --builder default cpu
compose run --rm --no-deps cpu
