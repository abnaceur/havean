#!/bin/sh
set -eu
exec 7>/tmp/haven-colmap-runtime-export.lock
flock -n 7 || { echo 'The private runtime export is already in use' >&2; exit 1; }
expected=sha256:fd94acd403520f75ff6bd0482fe1d2d19378c5793313e8214e66eaf7989d0cff
actual=$(docker image inspect haven-colmap-source:3.10-cpu-exclusions-investigation-v1 --format '{{.Id}}')
[ "$actual" = "$expected" ] || { echo 'The sealed source investigation image does not match' >&2; exit 1; }
# An existing cache is verified byte-for-byte during the Docker build. Never
# replace a populated export, silently reuse a changed source, or pull a tag.
mkdir -p services/property-processing/.colmap-runtime
if [ ! -f services/property-processing/.colmap-runtime/runtime-profile.json ]; then
  docker compose -p haven-reconstruction-runtime-tests -f compose.reconstruction-runtime.yaml --profile runtime-build run --rm --no-deps colmap-runtime-export
fi
docker compose -p haven-reconstruction-runtime-tests -f compose.reconstruction-runtime.yaml build --builder default colmap-runtime
