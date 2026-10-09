## Acceptance
Persist progress and implement dedicated BFF stream/revocation checks. Durable lifecycle state is replayed by sequence and current sessions/membership/target/evidence are rechecked while streaming.

## Implementation
API run/stage transitions persist redacted lifecycle events in their actor transactions: created/queued, leased, actual start, completed, failed, cancellation requested and confirmed termination. Lease recovery records new attempts, and renewal/replay does not duplicate start events. No percentage is fabricated. Dedicated listing/intake server-session BFF streams forward Last-Event-ID without buffering, abort on disconnect and periodically reauthorize membership, session and target/evidence; timelines contain opaque IDs, kind/state/time only. Durable original graph/dependency stages remain current authority protected.

## Tests
`./test-runner-protocol.sh` — passed.
`flock -n /tmp/haven-integration.lock docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests run --rm --no-deps tests pnpm exec playwright test tests/e2e/digitization-stream.spec.ts --project=desktop --project=mobile` — passed.
validation/progress-lifecycle-runner-final.log: seven real protocol/API/DB/S3/BullMQ journeys; actual two attempts produce exactly two lease events and one start event despite concurrent recovery, process death and receipt replay. Real completion/failure/cancellation activity persists.
validation/progress-stream-browser-final.log: four desktop/mobile actual identity/server-session browser checks; cursor resumes the actual persisted run draft and excludes old intake creation, session expiry and real membership revocation close active streams, reconnect denies. A draft with empty sources is never represented as processed output. Initial Playwright import of API decorators was unsupported (progress-stream-browser-initial.log); the fixture now invokes API domain code in its actual tsx configuration rather than altering the app's decorators.
validation/progress-workspace-final-gates.log: full lint/boundaries, all nine workspace types, 351 canonical operations, 114 units and task validation pass.

## Limitations
Lifecycle state is exact; ongoing decoder percentage remains unknown. Full OCR/candidate review, GPU reconstruction, scene publication and headset/device/country acceptance remain unfinished. Historical private source access is conservative; future reuse/invalidation policies must preserve exact source authority. No visual baseline or release approval.

## Next dependency
Remaining extraction/editor/tour tasks, HE-C08/C10 and measured device/release gates.

## O
No customer source or original parity approval.

## R
Supplied durable progress, Last-Event-ID recovery and server-session revocation requirements.

## P
Actual signed worker, CPU subprocess, PostgreSQL/S3/BullMQ, Keycloak and desktop/mobile BFF stream tests.

## V
No fabricated percentages, human parity, external headset or whole-engine approval.
