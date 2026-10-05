#!/bin/sh
set -eu
# This deliberately stops ONLY the isolated test database after browser tests finish.
compose() { docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml "$@"; }
restore() { compose start --wait db; }
trap restore EXIT HUP INT TERM
compose exec -T api node --input-type=module -e 'const r=await fetch("http://localhost:4000/api/v1/health/ready");if(r.status!==200)throw Error("Expected healthy readiness");console.log("Before outage: readiness 200")'
compose stop db
compose exec -T api node --input-type=module -e 'const live=await fetch("http://localhost:4000/api/v1/health/live");const ready=await fetch("http://localhost:4000/api/v1/health/ready");if(live.status!==200||ready.status!==503||(await ready.json()).error.code!=="NOT_READY")throw Error("Incorrect outage health response");console.log("Database stopped: liveness 200; readiness 503 NOT_READY")'
restore
trap - EXIT HUP INT TERM
compose exec -T api node --input-type=module -e 'const r=await fetch("http://localhost:4000/api/v1/health/ready");if(r.status!==200)throw Error("Readiness did not recover");console.log("Database restored: readiness 200")'
