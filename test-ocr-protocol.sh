#!/bin/sh
set -eu
lane=${1:-protocol}
case "$lane" in protocol|fact-review|images) ;; *) echo "Unknown OCR test lane" >&2; exit 1 ;; esac
test_file=tests/integration/digitization-document-ocr.test.ts
if [ "$lane" = images ]; then test_file=tests/integration/digitization-image-ocr.test.ts; fi
browser_fixture=false
if [ "$lane" = fact-review ]; then browser_fixture=true; fi
# Authored OCR pixels only; never reset the isolated integration project.
exec 9>/tmp/haven-processing-protocol.lock
flock -n 9 || { echo 'The private processing protocol lane is in use' >&2; exit 1; }
exec 8>/tmp/haven-integration.lock
flock -n 8 || { echo 'haven-integration is in use' >&2; exit 1; }
OCR_PROTOCOL_KEY_FILE=$(mktemp /tmp/haven-ocr-test-key.XXXXXX)
OCR_PROTOCOL_CONTAINER_NAME="haven-ocr-protocol-$$"
export OCR_PROTOCOL_KEY_FILE OCR_PROTOCOL_CONTAINER_NAME
ocr_protocol_project="haven-ocr-protocol-test-$$"
linked_integration=false
compose_ocr() { docker compose -p "$ocr_protocol_project" -f compose.ocr-tests.yaml "$@"; }
cleanup() { if [ "$linked_integration" = true ]; then docker network disconnect haven_processing haven-integration-api-1 >/dev/null 2>&1 || true; fi; compose_ocr rm -s -f ocr >/dev/null 2>&1 || true; rm -f "$OCR_PROTOCOL_KEY_FILE"; }
trap cleanup EXIT HUP INT TERM
# Deliberately public fixture key; no deployment credential is involved.
printf '%s' 'test-only-private-key-not-a-production-credential-0000' > "$OCR_PROTOCOL_KEY_FILE"
chmod 644 "$OCR_PROTOCOL_KEY_FILE"
docker image inspect haven-ocr-worker:3.3.3-clean-cpu-no-gui-investigation-v2 --format '{{.Id}}'
compose_ocr up -d --no-deps ocr
if ! docker inspect -f '{{json .NetworkSettings.Networks}}' haven-integration-api-1 | rg -q '"haven_processing"'; then
  docker network connect haven_processing haven-integration-api-1
  linked_integration=true
fi
docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T -e OCR_TEST_ORIGIN="http://$OCR_PROTOCOL_CONTAINER_NAME:8020" api node --input-type=module -e '
const deadline=Date.now()+15000;
for(;;){try{const r=await fetch(process.env.OCR_TEST_ORIGIN+"/health/ready",{signal:AbortSignal.timeout(1000)});if(r.ok)break;}catch{}if(Date.now()>deadline)throw Error("OCR_TEST_RUNNER_NOT_READY");await new Promise(resolve=>setTimeout(resolve,100));}'
docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T \
  -e DIGITIZATION_FACT_REVIEW_BROWSER_FIXTURE="$browser_fixture" -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration -e PROCESSING_DEPLOYMENT=test -e PROCESSING_ENABLE_OCR_INVESTIGATION=true \
  -e DIGITIZATION_RUNNER_TEST_ORIGIN="http://$OCR_PROTOCOL_CONTAINER_NAME:8020" api \
  pnpm exec vitest run "$test_file"

if [ "$lane" = fact-review ]; then
  docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests run --rm --no-deps tests pnpm exec playwright test tests/e2e/digitization-fact-review.spec.ts --project=desktop --project=mobile
fi
