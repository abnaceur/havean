# HE-R04 — Dedicated authenticated resumable BFF stream

## Acceptance
Dedicated listing/intake BFF routes forward Last-Event-ID, stream without buffering and abort upstream work on disconnect. API periodically revalidates actual session, membership, target/evidence authority and closes on expiration. Ordinary CSRF and thirty-second timeout remain unchanged. BFF/API connections are bounded and reconnectable.

## Implementation
apps/ops/src/digitization-stream.ts and specific app/api/v1/ops listing/intake events routes; apps/api/src/inventory/digitization/events.ts and registered controller routes; intakes.ts sequenced creation events; contracts transport/OpenAPI and generator streaming adapters; docs/adr/digitization-progress.md. Timeline contains allowlisted IDs/state/time only. No model text or fabricated percentage.

## Tests
`docker compose exec -T api pnpm exec vitest run tests/unit/digitization-stream.test.ts`
Passed two transport tests: actual streamed chunks before completion, resume/cookie scope forwarding, reader cancellation aborting upstream, retained 401 and rejection of non-stream successes.
`flock -n /tmp/haven-integration.lock docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests run --rm --no-deps tests sh -c 'node scripts/identity.mjs && pnpm exec playwright test tests/e2e/digitization-stream.spec.ts --project=desktop --project=mobile'`
Passed both real desktop/mobile browser tests on 6 October 2026: actual Keycloak server-session sign-in and private intake creation; initial event ID replay; Last-Event-ID resumes without duplicate creation event; expiry of the actual session row closes the open BFF stream within the periodic bound; reconnect returns 401. Retained stream-browser.log. Initial run hit a concurrent checkout/bootstrap mismatch in development identity flow before engine calls; routine existing identity bootstrap synchronized the isolated development fixture. Production MFA policy was not changed by engine code. Typecheck/lint/contracts passed.

## Limitations
HE-C09 must produce stage progress/branch timelines after the durable graph; this prerequisite streams existing workspace events. Current private authority remains conservative across historical bindings until HE-B05/C10. Event replay retention/pagination operations policy follows engine cleanup. No browser screenshots are promoted to V.

## Next dependency
HE-C09 stage progress and scoped timeline after HE-C01; independent upload/source and runner work continues.

## O
No private source screenshot.
## R
Supplied Last-Event-ID/session revocation and existing server-session boundary.
## P
Actual browser/identity/API/PostgreSQL stream expiry tests, plus transport cancellation units.
## V
No full job recovery, visual parity, device or production acceptance.
