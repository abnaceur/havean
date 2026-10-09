#!/bin/sh
set -eu
# Real API Node transport ↔ CPU runner. Start the digitization Compose profile first.
# No haven-integration reset, infrastructure credentials or published host port.
lane=${1:-protocol}
case "$lane" in protocol|plan-editor) ;; *) echo 'Unknown private runner test lane' >&2; exit 1 ;; esac
exec 9>/tmp/haven-processing-protocol.lock
flock -n 9 || { echo 'The isolated runner protocol lane is already in use' >&2; exit 1; }
runner_name="haven-digitization-protocol-test-$$"
# The authorized DB/S3 portion shares the existing isolated project's lock.
exec 8>/tmp/haven-integration.lock
flock -n 8 || { echo 'haven-integration is already in use' >&2; exit 1; }
linked_integration=false
fixture_key=$(mktemp /tmp/haven-runner-test-key.XXXXXX)
cleanup() { if [ "$linked_integration" = true ]; then docker network disconnect haven_processing haven-integration-api-1 >/dev/null 2>&1 || true; fi; docker rm -f "$runner_name" >/dev/null 2>&1 || true; rm -f "$fixture_key"; }
trap cleanup EXIT HUP INT TERM
# Deliberately public synthetic test credential, never a deployment secret.
printf '%s' 'test-only-private-key-not-a-production-credential-0000' > "$fixture_key"
chmod 644 "$fixture_key"
runner_image=$(docker image inspect haven-processing-tests-cpu --format '{{.Id}}')
docker run --detach --rm --name "$runner_name" --network haven_processing \
  --read-only --cap-drop ALL --security-opt no-new-privileges:true \
  --memory 512m --cpus 1 --pids-limit 64 --user 10001:10001 \
  --tmpfs /jobs:size=67108864,uid=10001,gid=10001,mode=0700 \
  --tmpfs /tmp:size=67108864,mode=1777 \
  --mount "type=bind,source=$fixture_key,target=/run/runner-test-key,readonly" \
  --env PROCESSING_DEPLOYMENT=test --env PROCESSING_ADAPTER=unavailable \
  --env PROCESSING_ENABLE_SIMULATOR=false --env PROCESSING_EXECUTION_ROOT=/jobs \
  --env PROCESSING_SIGNING_KEY_FILE=/run/runner-test-key \
  "$runner_image" python -m property_processing.server >/dev/null
# Check actual readiness with a bounded retry inside the existing API container.
docker compose exec -T -e RUNNER_TEST_ORIGIN="http://$runner_name:8020" api node --input-type=module -e '
const deadline=Date.now()+10000;
for(;;){try{const response=await fetch(process.env.RUNNER_TEST_ORIGIN+"/health/ready",{signal:AbortSignal.timeout(1000)});if(response.ok)break;}catch{}if(Date.now()>deadline)throw Error("RUNNER_TEST_NOT_READY");await new Promise(resolve=>setTimeout(resolve,100));}'
if [ "$lane" = protocol ]; then
docker compose exec -T -e DIGITIZATION_RUNNER_TEST_ORIGIN="http://$runner_name:8020" api \
  pnpm exec vitest run tests/integration/digitization-runner-protocol.test.ts

fi

# API is the only bridge between infrastructure and runner networks. The runner
# receives neither infrastructure network access nor database/storage credentials.
if ! docker inspect -f '{{json .NetworkSettings.Networks}}' haven-integration-api-1 | rg -q '"haven_processing"'; then
  docker network connect haven_processing haven-integration-api-1
  linked_integration=true
fi
if [ "$lane" = plan-editor ]; then
  for project in desktop mobile desktop-floors mobile-floors conflicts reuse; do
    docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T \
      -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration -e TSX_TSCONFIG_PATH=apps/api/tsconfig.json \
      -e DIGITIZATION_RUNNER_TEST_ORIGIN="http://$runner_name:8020" api \
      pnpm exec tsx tests/support/digitization-plan-fixture.ts "$project"
  done
  docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration -e DIGITIZATION_RUNNER_TEST_ORIGIN="http://$runner_name:8020" api pnpm exec vitest run tests/integration/digitization-trace-checkpoints.test.ts tests/integration/digitization-render-reuse.test.ts
  docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests run --rm --no-deps tests \
    pnpm exec playwright test tests/e2e/digitization-plan.spec.ts --project=desktop --project=mobile
else
docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T \
  -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration \
  -e DIGITIZATION_RUNNER_TEST_ORIGIN="http://$runner_name:8020" api \
  pnpm exec vitest run tests/integration/digitization-authorized-runner.test.ts tests/integration/digitization-coordinator.test.ts tests/integration/digitization-public-derivatives.test.ts

fi
