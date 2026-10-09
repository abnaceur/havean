#!/bin/sh
set -eu
mkdir -p infra/generated
git ls-files -z > infra/generated/ci-secret-files.list
mkdir -p evidence/digitization/validation
if ./test-processing.sh > evidence/digitization/validation/cpu-ci.log 2>&1; then
  echo 'CPU processing tests passed'
else
  echo 'CPU processing tests failed; see evidence/digitization/validation/cpu-ci.log' >&2
  exit 1
fi
./test.sh env HAVEN_SOURCE_REVISION="$(git rev-parse HEAD)" HAVEN_SCAN_MANIFEST=/workspace/infra/generated/ci-secret-files.list sh scripts/ci-check.sh
