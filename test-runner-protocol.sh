#!/bin/sh
set -eu
# Real API Node transport ↔ CPU runner. Start the digitization Compose profile first.
# No haven-integration reset, infrastructure credentials or published host port.
lane=${1:-protocol}
case "$lane" in capture-source-browser|capture-source|protocol|unit-application|worker-crash|failure-finalization|operator-processing|scene-preview|registration-review|model-review|model-publication|model-source-consent|publication|account-deletion|tenant-deletion|derived-output-deletion|native-facts|plan-editor|assisted-lines|media-probe|media-frames|frame-dataset|frame-privacy|panorama|tour-graph|panorama-review|tour-map|tour-review|tour-inventory) ;; *) echo 'Unknown private runner test lane' >&2; exit 1 ;; esac
exec 9>/tmp/haven-processing-protocol.lock
flock -n 9 || { echo 'The isolated runner protocol lane is already in use' >&2; exit 1; }
media_enabled=false
if [ "$lane" = capture-source-browser ] || [ "$lane" = capture-source ] || [ "$lane" = media-probe ] || [ "$lane" = media-frames ] || [ "$lane" = frame-dataset ] || [ "$lane" = frame-privacy ]; then media_enabled=true; fi
runner_name="haven-digitization-protocol-test-$$"
# The authorized DB/S3 portion shares the existing isolated project's lock.
exec 8>/tmp/haven-integration.lock
flock -n 8 || { echo 'haven-integration is already in use' >&2; exit 1; }
linked_integration=false
runner_network="$runner_name-network"
network_created=false
fixture_key=$(mktemp /tmp/haven-runner-test-key.XXXXXX)
cleanup() { if [ "$linked_integration" = true ]; then docker network disconnect "$runner_network" haven-integration-api-1 >/dev/null 2>&1 || true; fi; docker rm -f "$runner_name" >/dev/null 2>&1 || true; rm -f "$fixture_key"; if [ "$network_created" = true ]; then docker network rm "$runner_network" >/dev/null 2>&1 || true; fi; }
trap cleanup EXIT HUP INT TERM
# Deliberately public synthetic test credential, never a deployment secret.
printf '%s' 'test-only-private-key-not-a-production-credential-0000' > "$fixture_key"
chmod 644 "$fixture_key"
runner_image=$(docker image inspect haven-processing-tests-cpu:1.0.0-cpu-v1 --format '{{.Id}}')
if docker network inspect haven_processing >/dev/null 2>&1; then
  [ "$(docker network inspect -f '{{.Internal}}' haven_processing)" = true ] || { echo 'The processing network must be internal' >&2; exit 1; }
  runner_network=haven_processing
else
  docker network create --internal "$runner_network" >/dev/null
  network_created=true
fi
docker run --detach --rm --name "$runner_name" --network "$runner_network" \
  --read-only --cap-drop ALL --security-opt no-new-privileges:true \
  --memory 512m --cpus 1 --pids-limit 64 --user 10001:10001 \
  --tmpfs /jobs:size=67108864,uid=10001,gid=10001,mode=0700 \
  --tmpfs /tmp:size=67108864,mode=1777 \
  --mount "type=bind,source=$fixture_key,target=/run/runner-test-key,readonly" \
  --mount "type=bind,source=$PWD/services/property-processing/property_processing,target=/opt/processing/property_processing,readonly" \
  --env PROCESSING_DEPLOYMENT=test --env PROCESSING_ADAPTER=unavailable \
  --env PROCESSING_ENABLE_SIMULATOR=false --env "PROCESSING_ENABLE_MEDIA_PROBE=$media_enabled" --env PROCESSING_EXECUTION_ROOT=/jobs \
  --env PROCESSING_SIGNING_KEY_FILE=/run/runner-test-key \
  "$runner_image" python -m property_processing.server >/dev/null
# Only the isolated integration API bridges storage and this disposable runner.
if ! docker inspect -f '{{json .NetworkSettings.Networks}}' haven-integration-api-1 | rg -Fq '"'"$runner_network"'"'; then
  docker network connect "$runner_network" haven-integration-api-1
  linked_integration=true
fi
# Check actual readiness with a bounded retry inside the existing API container.
docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T -e RUNNER_TEST_ORIGIN="http://$runner_name:8020" api node --input-type=module -e '
const deadline=Date.now()+10000;
for(;;){try{const response=await fetch(process.env.RUNNER_TEST_ORIGIN+"/health/ready",{signal:AbortSignal.timeout(1000)});if(response.ok)break;}catch{}if(Date.now()>deadline)throw Error("RUNNER_TEST_NOT_READY");await new Promise(resolve=>setTimeout(resolve,100));}'
if [ "$lane" = protocol ]; then
docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration -e DIGITIZATION_RUNNER_TEST_ORIGIN="http://$runner_name:8020" api \
  pnpm exec vitest run tests/integration/digitization-runner-protocol.test.ts

fi

if [ "$lane" = tenant-deletion ]; then
  docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration -e DIGITIZATION_RUNNER_TEST_ORIGIN="http://$runner_name:8020" api pnpm exec vitest run tests/integration/digitization-tenant-deletion.test.ts
  docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests run --rm --no-deps tests pnpm exec playwright test tests/e2e/digitization-tenant-deletion.spec.ts --project=desktop --project=mobile
elif [ "$lane" = account-deletion ]; then
  docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration -e DIGITIZATION_RUNNER_TEST_ORIGIN="http://$runner_name:8020" api pnpm exec vitest run tests/integration/digitization-account-deletion.test.ts
elif [ "$lane" = worker-crash ]; then
  docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration -e DIGITIZATION_RUNNER_TEST_ORIGIN="http://$runner_name:8020" api pnpm exec vitest run tests/integration/digitization-worker-crash.test.ts tests/integration/digitization-dispatch-fairness.test.ts
elif [ "$lane" = failure-finalization ]; then
  docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration -e DIGITIZATION_RUNNER_TEST_ORIGIN="http://$runner_name:8020" api pnpm exec vitest run tests/integration/digitization-authorized-runner.test.ts
elif [ "$lane" = scene-preview ] || [ "$lane" = registration-review ] || [ "$lane" = model-review ] || [ "$lane" = model-publication ] || [ "$lane" = model-source-consent ]; then
  scene_fixture=$(mktemp -d "$PWD/infra/generated/integration/scene-export-fixture.XXXXXX")
  docker compose -f services/property-processing/compose.tests.yaml run --rm --no-deps --user "$(id -u):$(id -g)" -e PYTHONPATH=/opt/processing -v "$PWD/services/property-processing/property_processing:/opt/processing/property_processing:ro" -v "$PWD/services/property-processing/tests:/opt/processing/tests:ro" -v "$scene_fixture:/fixture" cpu python tests/export_splat_fixture.py /fixture
  owner_model=false
  if [ "$lane" = model-source-consent ]; then owner_model=true; fi
  docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T -e DIGITIZATION_OWNER_MODEL_FIXTURE="$owner_model" -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration -e TSX_TSCONFIG_PATH=apps/api/tsconfig.json -e SCENE_EXPORT_FIXTURE_DIR="infra/generated/integration/$(basename "$scene_fixture")" api pnpm exec tsx tests/support/digitization-scene-fixture.ts
  if [ "$lane" = model-source-consent ]; then
    docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration api pnpm exec vitest run tests/integration/digitization-model-source-consent.test.ts
    docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests run --rm --no-deps tests pnpm exec playwright test tests/e2e/digitization-model-source-consent.spec.ts --project=desktop --project=mobile
  elif [ "$lane" = model-publication ]; then
    docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration api pnpm exec vitest run tests/integration/digitization-model-publication.test.ts
    docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests run --rm --no-deps tests pnpm exec playwright test tests/e2e/digitization-model-publication.spec.ts --project=desktop --project=mobile
  elif [ "$lane" = model-review ]; then
    docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration api pnpm exec vitest run tests/integration/digitization-registration-review.test.ts
    docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration api pnpm exec vitest run tests/integration/digitization-model-review.test.ts tests/integration/digitization-lifecycle-events.test.ts
    docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests run --rm --no-deps tests pnpm exec playwright test tests/e2e/digitization-model-review.spec.ts --project=desktop --project=mobile
  elif [ "$lane" = registration-review ]; then
    docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration api pnpm exec vitest run tests/integration/digitization-registration-review.test.ts tests/integration/digitization-lifecycle-events.test.ts
    docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests run --rm --no-deps tests pnpm exec playwright test tests/e2e/digitization-registration-review.spec.ts --project=desktop --project=mobile
  else
    docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration api pnpm exec vitest run tests/integration/digitization-scene-privacy.test.ts tests/integration/digitization-scene-registration.test.ts
    docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests run --rm --no-deps tests pnpm exec playwright test tests/e2e/digitization-scene-preview.spec.ts --project=desktop --project=mobile
  fi
elif [ "$lane" = operator-processing ] || [ "$lane" = unit-application ] || [ "$lane" = capture-source ] || [ "$lane" = capture-source-browser ]; then
  operator_fixture=operator-processing
  operator_entry=tests/support/digitization-operator-fixture.ts
  operator_test=tests/e2e/digitization-operator-processing.spec.ts
  if [ "$lane" = unit-application ]; then
    operator_fixture=unit-application
    operator_entry=tests/support/digitization-unit-application-fixture.ts
    operator_test=tests/e2e/digitization-unit-application.spec.ts
    docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration api pnpm exec vitest run tests/integration/digitization-inventory-application.test.ts tests/integration/digitization-lifecycle-events.test.ts
  fi
  if [ "$lane" = capture-source ] || [ "$lane" = capture-source-browser ]; then
    operator_fixture=capture-source
    operator_entry=tests/support/digitization-capture-source-fixture.ts
    operator_test=tests/e2e/digitization-capture-source.spec.ts
    if [ "$lane" = capture-source ]; then
    docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration -e DIGITIZATION_RUNNER_TEST_ORIGIN="http://$runner_name:8020" api pnpm exec vitest run tests/integration/digitization-capture-source.test.ts
    fi
  fi
  docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration -e TSX_TSCONFIG_PATH=apps/api/tsconfig.json api pnpm exec tsx "$operator_entry"
  docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T api rm -f /tmp/haven-operator-coordinator-ready /tmp/haven-operator-coordinator-stop
  docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration -e TSX_TSCONFIG_PATH=apps/api/tsconfig.json -e DIGITIZATION_RUNNER_TEST_ORIGIN="http://$runner_name:8020" -e DIGITIZATION_OPERATOR_FIXTURE_PREFIX="$operator_fixture" api pnpm exec tsx tests/support/digitization-operator-coordinator.ts &
  operator_process=$!
  operator_ready=false
  for attempt in $(seq 1 100); do
    if docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T api test -f /tmp/haven-operator-coordinator-ready; then operator_ready=true; break; fi
    sleep 0.2
  done
  if [ "$operator_ready" != true ]; then kill "$operator_process" 2>/dev/null || true; exit 1; fi
  operator_result=0
  docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests run --rm --no-deps tests pnpm exec playwright test "$operator_test" --project=desktop --project=mobile || operator_result=$?
  docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T api touch /tmp/haven-operator-coordinator-stop || true
  wait "$operator_process" || true
  exit "$operator_result"
elif [ "$lane" = assisted-lines ]; then
  for project in desktop mobile conflicts; do
    docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration -e TSX_TSCONFIG_PATH=apps/api/tsconfig.json -e DIGITIZATION_RUNNER_TEST_ORIGIN="http://$runner_name:8020" api pnpm exec tsx tests/support/digitization-plan-fixture.ts "$project"
  done
  docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration api pnpm exec vitest run tests/unit/digitization-plan-proposals.test.ts tests/integration/digitization-plan-proposals.test.ts
  docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests run --rm --no-deps tests pnpm exec playwright test tests/e2e/digitization-plan-proposals.spec.ts --project=desktop --project=mobile
elif [ "$lane" = plan-editor ]; then
  for project in desktop mobile desktop-floors mobile-floors desktop-dimensions mobile-dimensions conflicts reuse; do
    docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T \
      -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration -e TSX_TSCONFIG_PATH=apps/api/tsconfig.json \
      -e DIGITIZATION_RUNNER_TEST_ORIGIN="http://$runner_name:8020" api \
      pnpm exec tsx tests/support/digitization-plan-fixture.ts "$project"
  done
  docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration -e DIGITIZATION_RUNNER_TEST_ORIGIN="http://$runner_name:8020" api pnpm exec vitest run tests/integration/digitization-trace-checkpoints.test.ts tests/integration/digitization-render-reuse.test.ts
  # Both browser projects originate at one real gateway address. Keep the
  # production 60-second request window intact rather than bypassing its limits.
  first_batch=true
  for project in desktop mobile; do
    for selection in 'HE-E03|HE-E04|HE-E05|HE-E10' 'HE-E11|HE-E06|HE-E07|HE-F04'; do
      if [ "$first_batch" = false ]; then sleep 60; fi
      first_batch=false
      docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests run --rm --no-deps tests \
        pnpm exec playwright test tests/e2e/digitization-plan.spec.ts --project="$project" --grep "$selection"
    done
  done
elif [ "$lane" = derived-output-deletion ]; then
  docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration -e DIGITIZATION_RUNNER_TEST_ORIGIN="http://$runner_name:8020" api pnpm exec vitest run tests/integration/digitization-output-deletion.test.ts
elif [ "$lane" = native-facts ]; then
  docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration -e DIGITIZATION_RUNNER_TEST_ORIGIN="http://$runner_name:8020" api pnpm exec vitest run tests/integration/digitization-native-facts.test.ts
elif [ "$lane" = panorama-review ]; then
  for project in panorama-desktop panorama-mobile; do
    docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration -e TSX_TSCONFIG_PATH=apps/api/tsconfig.json -e DIGITIZATION_RUNNER_TEST_ORIGIN="http://$runner_name:8020" api pnpm exec tsx tests/support/digitization-plan-fixture.ts "$project"
  done
  docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests run --rm --no-deps tests pnpm exec playwright test tests/e2e/digitization-panorama.spec.ts tests/e2e/rich-media.spec.ts --project=desktop --project=mobile
elif [ "$lane" = tour-map ]; then
  for project in desktop mobile; do
    docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration -e TSX_TSCONFIG_PATH=apps/api/tsconfig.json -e DIGITIZATION_RUNNER_TEST_ORIGIN="http://$runner_name:8020" api pnpm exec tsx tests/support/digitization-tour-map-fixture.ts "$project"
  done
  docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests run --rm --no-deps tests pnpm exec playwright test tests/e2e/digitization-tour-map.spec.ts --project=desktop --project=mobile
elif [ "$lane" = publication ]; then
  for project in desktop mobile; do
    docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration -e TSX_TSCONFIG_PATH=apps/api/tsconfig.json -e DIGITIZATION_TOUR_INVENTORY_FIXTURE=true -e DIGITIZATION_RUNNER_TEST_ORIGIN="http://$runner_name:8020" api pnpm exec tsx tests/support/digitization-tour-map-fixture.ts "$project"
  done
  docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests run --rm --no-deps tests pnpm exec playwright test tests/e2e/digitization-publication.spec.ts --project=desktop --project=mobile
elif [ "$lane" = tour-inventory ]; then
  docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration -e TSX_TSCONFIG_PATH=apps/api/tsconfig.json -e DIGITIZATION_TOUR_INVENTORY_FIXTURE=true -e DIGITIZATION_RUNNER_TEST_ORIGIN="http://$runner_name:8020" api pnpm exec tsx tests/support/digitization-tour-map-fixture.ts desktop
  docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration -e DIGITIZATION_TOUR_INVENTORY_FIXTURE=true -e DIGITIZATION_RUNNER_TEST_ORIGIN="http://$runner_name:8020" api pnpm exec vitest run tests/integration/digitization-tour-review.test.ts
elif [ "$lane" = tour-review ]; then
  for project in desktop mobile; do
    docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration -e TSX_TSCONFIG_PATH=apps/api/tsconfig.json -e DIGITIZATION_RUNNER_TEST_ORIGIN="http://$runner_name:8020" api pnpm exec tsx tests/support/digitization-tour-map-fixture.ts "$project"
  done
  docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration -e DIGITIZATION_RUNNER_TEST_ORIGIN="http://$runner_name:8020" api pnpm exec vitest run tests/integration/digitization-tour-review.test.ts
  docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests run --rm --no-deps tests pnpm exec playwright test tests/e2e/digitization-tour-review.spec.ts --project=desktop --project=mobile
elif [ "$lane" = frame-privacy ]; then
  docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration -e DIGITIZATION_FRAME_PRIVACY_BROWSER_FIXTURE=true -e DIGITIZATION_RUNNER_TEST_ORIGIN="http://$runner_name:8020" api pnpm exec vitest run tests/integration/digitization-frame-dataset.test.ts
  docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests run --rm --no-deps tests pnpm exec playwright test tests/e2e/digitization-frame-privacy.spec.ts --project=desktop --project=mobile
elif [ "$lane" = frame-dataset ]; then
  docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration -e DIGITIZATION_RUNNER_TEST_ORIGIN="http://$runner_name:8020" api pnpm exec vitest run tests/integration/digitization-frame-dataset.test.ts
elif [ "$lane" = media-frames ]; then
  docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration -e DIGITIZATION_RUNNER_TEST_ORIGIN="http://$runner_name:8020" api pnpm exec vitest run tests/integration/digitization-media-frames.test.ts
elif [ "$lane" = tour-graph ]; then
  docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration -e DIGITIZATION_RUNNER_TEST_ORIGIN="http://$runner_name:8020" api pnpm exec vitest run tests/integration/digitization-tour-graph.test.ts
elif [ "$lane" = panorama ]; then
  docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration -e DIGITIZATION_RUNNER_TEST_ORIGIN="http://$runner_name:8020" api pnpm exec vitest run tests/integration/digitization-panorama.test.ts
elif [ "$lane" = media-probe ]; then
  docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T     -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration     -e DIGITIZATION_RUNNER_TEST_ORIGIN="http://$runner_name:8020" api     pnpm exec vitest run tests/integration/digitization-media-probe.test.ts
else
docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T \
  -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration \
  -e DIGITIZATION_RUNNER_TEST_ORIGIN="http://$runner_name:8020" api \
  pnpm exec vitest run tests/integration/digitization-authorized-runner.test.ts tests/integration/digitization-coordinator.test.ts tests/integration/digitization-public-derivatives.test.ts

fi
