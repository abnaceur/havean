#!/bin/sh
set -eu
# Uses the already seeded isolated Compose project. Does not reset host resources.
exec 7>/tmp/haven-digitization-software.lock
flock -n 7 || { echo 'The digitization software suite is already running' >&2; exit 1; }
mkdir -p evidence/digitization/validation
integration() { docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T api "$@"; }
integration node scripts/processing-licenses.mjs > evidence/digitization/validation/software-licenses.log 2>&1
integration node scripts/digitization-fixtures.mjs > evidence/digitization/validation/software-fixture-provenance.log 2>&1
integration pnpm contracts:check > evidence/digitization/validation/software-contracts.log 2>&1
for lane in native-facts failure-finalization worker-crash operator-processing unit-application capture-source scene-preview registration-review model-review model-publication model-source-consent tour-inventory publication account-deletion tenant-deletion derived-output-deletion; do
  echo "Running actual $lane checks"
  ./test-runner-protocol.sh "$lane" > "evidence/digitization/validation/software-$lane.log" 2>&1
done
integration env HAVEN_CONTAINER_TESTS=true HAVEN_ENV_FILE=.env.integration pnpm exec vitest run tests/integration/account-privacy.test.ts > evidence/digitization/validation/software-account-retention.log 2>&1
echo 'CPU worker, scoped storage, operator review, public panorama/model publication and deletion software checks passed. GPU/headset and release acceptance are separate gates.'
