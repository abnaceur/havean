#!/bin/sh
set -eu
# CI owns its isolated stack; the normal host suite never invokes this reset.
mkdir -p evidence/digitization/validation
./test-processing.sh > evidence/digitization/validation/software-clean-cpu.log 2>&1
PROCESSING_RECOVERY_FIXTURE=/tmp docker compose -f services/property-processing/compose.recovery-tests.yaml build --builder default processing-cpu > evidence/digitization/validation/software-recovery-test-image-build.log 2>&1
./test-processing-recovery.sh > evidence/digitization/validation/software-runner-recovery.log 2>&1
./test.sh true > evidence/digitization/validation/software-clean-bootstrap.log 2>&1
flock -n /tmp/haven-integration.lock ./test-processing-recovery.sh --database > evidence/digitization/validation/software-database-runner-recovery.log 2>&1
./test-digitization-software.sh
