## Acceptance
Add process cancellation. A run closes only after confirmed decoder termination; cancelled/fenced callbacks cannot commit.

## Implementation
Current initiating actor, target scope, version and workflow guard session/service cancellation requests. The API persists cancel_requested and a durable dedicated queue handoff before any network action. Runner stop establishes an immutable cancelled execution tombstone even if submission has not arrived; actual active supervision tracks processStopped until process-group termination/reaping and late-output cleanup settle. The API confirms all active execution stops before SQL172 closes stages/run. Narrow target/initiator-scoped cleanup descriptors permit stop capabilities after source grant expiration without source transfer/read/publication. Foreign actors cannot inspect or close cancellation. Lost handoffs remain recoverable from PostgreSQL. Closure/replay emits one redacted activity event.

## Tests
`./test-processing.sh` — passed 69 actual CPU checks, including real child cancellation and late preview rejection, plus processStopped remains false until execution settlement.
`./test-runner-protocol.sh` — passed seven real transport/API/DB/S3/queue journeys. A 9-megapixel actual image execution is observed active; authenticated cancel is delivered through BullMQ, confirms cancelled/processStopped=true/result=null, closes the run, rejects late collect and produces no artifact. Foreign metadata/closure deny and repeated closure is idempotent.
Logs: validation/cancellation-process-stop-cpu-final.log, validation/cancellation-queue-final.log, validation/cancellation-initial-checks.log. Full lint and nine workspace types pass in validation/coordinator-workspace-final-gates.log; its unit failure was a stale fixture assumption that Q11 remained todo after platform completion. The isolated fixture now explicitly makes Q11 unfinished without changing the live ledger. All 114 units, 351 contracts and both ledgers pass in validation/coordinator-workspace-corrected-gates.log.

## Limitations
A runner outage leaves cancel_requested until stop acknowledgement can be retried; it never reports an unconfirmed stop. Revoked agency membership cannot gain new service authority. Advanced OCR/video/GPU profiles still require separate typed stop support. No publication or full-engine completion.

## Next dependency
Continue HE-C08/C09/C10 and remaining extraction/editor/tour work.

## O
Only synthetic CPU sources and temporary isolated service fixtures.

## R
Persist cancellation before network work; process termination and execution fences must both protect completion.

## P
Actual isolated CPU child, signed Nest API, durable PostgreSQL/BullMQ cancellation and late callback rejection.

## V
No GPU cancellation, headset, country extraction, production or complete engine approval.

## Earlier implementation history
# HE-C07 — In progress

API-owned `requestRunCancellation` checks actual current agency/target/evidence authority, initiating actor, run version and workflow state in a short transaction. It persists cancellation and one redacted activity/outbox event before any runner transfer. Repeating the current-version request returns the same cancellation state; stale versions conflict. Existing lease/SQL guards deny subsequent renewal or successful completion. The run stays `cancel_requested` until a future coordinator verifies process termination; this service does not falsely close a running process.

P: host-locked real PostgreSQL lease/workflow suite passes six checks (`validation/cancellation-api-integration.log`), including unauthorized admin-role substitution, stale version, one repeated-request event and denied renewal. Python runner tests already exercise actual child process termination and cancellation winning against late output (`validation/decoder-isolation-final.log`). API typecheck passes (`validation/cancellation-preview-types.log`). R: supplied cancellation/fencing rules. O: synthetic execution/source fixtures only. V: authenticated API route, queue cancellation delivery, guarded callbacks and end-to-end active Haven-run cancellation remain unfinished. Do not mark the task done.

Next: current-run worker capability and dedicated engine consumer/coordinator, then process-stop acknowledgement and late authenticated callback rejection.
