# Public read performance (P)

## Public browsing log sampling

Anonymous successful GETs for listing search/detail retain response request IDs and full metric counters; their structured completion logs are sampled at 1/100 with an explicit `sampleRate`. Errors, authenticated/private reads and mutations retain completion logs. SQL audit events are unaffected. SQL166 retains stamp query plans without caching revision/deadline values; queued anonymous callers share a query only when submitted before that query starts.

## Capacity sizing and load generator — 9 October 2026 (P)

The current compiled API exhibits CPU throttling at the two-CPU cap; its ten-minute SQL167 run misses latency targets despite zero errors. Four-CPU API sizing removes that smoke bottleneck (1,000 sessions, search p95 108.712 ms / detail p95 39.858 ms). Production Compose now declares four CPUs and retains the two-GiB API memory cap; search remains two CPUs/two GiB. The final ten-minute four-CPU report is recorded in Q07 and four-cpu-1000-final.json; its declared fixture/mix meets the three targets. The separate four-worker load generator declares four CPUs/two GiB and keeps 1,000 distinct signed visitors, common warmup/start/end boundaries and the same 60/40 mix. A real synthetic HTTP scheduler probe verifies visitor identity and request accounting. These measurements remain shared-host P evidence, not field or original-site parity. Two-CPU failures are retained.
