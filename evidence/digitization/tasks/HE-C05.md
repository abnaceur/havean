## Acceptance
Add reconciliation and runner reattachment. Verified under the supplied small-document/image first-slice scope.

## Implementation
Dedicated dispatcher recovers lost Redis handoffs from opaque PostgreSQL recovery event IDs without granting raw table access. Durable API receipts reattach current attempts after coordinator process death. Expired leases reconcile under a transaction/event lock to one new execution/fence, with at most three attempts. Cancellation, current source authority/revision, creator, deadline and every guarded transition are rechecked. Original event receipts remain immutable.

## Tests
Actual BullMQ coordinator subprocess is killed with SIGKILL after real CPU submission; a fresh worker recovers the stalled job and commits one result. The same journey removes a real Redis handoff, recovers from PostgreSQL, expires a real lease, sends concurrent recovery requests and rejects the old signed execution.
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
