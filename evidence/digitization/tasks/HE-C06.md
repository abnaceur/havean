## Acceptance
Add bounded retry/error classification. Verified under the supplied small-document/image first-slice scope.

## Implementation
Dedicated queue retries transient HTTP/runner outages at most five deliveries with bounded exponential backoff; dispatcher never resets failed deliveries. Current processing attempts are capped at three. Permanent authenticated command/input/authority failures use BullMQ UnrecoverableError. Actual runner terminal failures commit failed_terminal privately under the current lease, emit redacted state and create no artifacts or eligible dependent stage. Interrupted runner outcomes are failed_retryable and acquire a fresh bounded attempt on recovery. Provider diagnostics are not logged.

## Tests
A real HTTP server returns 503 to the real BullMQ worker: exactly five calls/deliveries, no dispatcher retry reset. A real unsupported engine event fails after one delivery despite attempts=5. Actual over-budget PDF execution records failed_terminal and cannot loop or create artifacts.
`./test-runner-protocol.sh` — passed.
Logs: validation/coordinator-retry-final.log (seven real protocol/API/DB/S3/queue journeys), validation/coordinator-recovery-scoped-final.log (six recovery/fencing journeys), validation/coordinator-cpu-final.log (69 CPU checks), validation/coordinator-retry-checks.log (API/worker types, 348 operations, targeted lint and boundaries).

## Limitations
No full engine, OCR adapter, country benchmark, GPU reconstruction, device/headset or publication acceptance. Source renders remain private/privacy-pending. Expired or revoked processing authority fails closed. Failed queue deliveries require supported recovery/operator action after their cap; polling does not silently reset them.

## Next dependency
HE-C07–C10 and HE-D02 onward, with real scoped evidence and independent publication gates.

## O
Synthetic sources only; no customer originals or parity approval.

## R
Supplied durable execution, recovery, isolation and coordinate requirements.

## P
Actual CPU decoder, real process kill, database, private storage, HTTP and BullMQ, with retained failures.

## V
Country extraction, OCR review, reconstruction and headset/full-engine approval remain unverified.
