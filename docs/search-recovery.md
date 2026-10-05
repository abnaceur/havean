# Search operations in Docker

Run a rebuild in the configured stack:

```sh
docker compose exec -T worker pnpm search:rebuild
```

The JSON result contains the rebuild ID, verified public count/hash, schema version and retained previous index UID. A failed command exits nonzero and does not report success. If the source changed, repeat the command against its current revision. Consumer search remains available through its declared SQL fallback.

Inspect `/api/v1/health/metrics` through an authenticated admin session for `search` lag, pending events, provider availability and indexed-document count. A null document count means statistics were unavailable. Sustained lag needs worker/outbox/provider investigation; repairing a provider does not by itself complete queued jobs.

Each successful swap retains the previous generation under the reported `listings_rebuild_<uuid>` UID. After reviewing the successful report and current query/eligibility checks, an operator can remove an older retained UID using the internal authenticated search API's `DELETE /indexes/<uid>` operation. Preserve the latest known previous generation while investigating uncertain outcomes. The serving UID is `listings`. Backups may contain older eligibility, so recovery should rebuild from current SQL rather than assume a retained generation is current inventory.

The local provider and inventory are synthetic development fixtures. This runbook does not assert production deployment or production load/restore completion.
