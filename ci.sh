#!/bin/sh
set -eu
mkdir -p infra/generated
git ls-files -z > infra/generated/ci-secret-files.list
./test.sh env HAVEN_SCAN_MANIFEST=/workspace/infra/generated/ci-secret-files.list sh scripts/ci-check.sh
