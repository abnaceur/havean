# Search rebuild and recovery

The worker owns public search projection writes. The operational `pnpm search:rebuild` capability uses the configured worker database and search credentials, not a public browser endpoint. It creates a unique temporary index, applies the versioned canonical settings, and uploads only validated current public documents in batches of 1,000. The pilot limit is 100,000 total inventory rows; exceeding it fails before altering the serving index.

The rebuild checks document count and a canonical content hash, then rechecks the source snapshot. Source changes or candidate corruption abort the swap and leave the previous serving generation available. PostgreSQL advisory locks serialize rebuilds against ordinary projection writes across worker processes. Publication writes continue. A write queued behind the rebuild projects the current source after the rebuild commits; its old event payload cannot resurrect withdrawn inventory.

Meilisearch's completed atomic swap is the serving change. A successful database commit records projection versions/tombstones and an audit/outbox event with the operation ID and sanitized counts/hash. The output identifies the retained previous index. If swap acknowledgement or the subsequent database commit is uncertain, retain both generations for inspection and rerun the rebuild from current SQL; do not infer that the external swap rolled back with the database transaction.

Public API queries always hydrate and verify current SQL eligibility and ordering. During rebuilding, provider/index outage or staleness, the declared SQL path returns current matches, not a false zero. The English list displays recovery status for actual outage/staleness. Intentional SQL ranking/spatial/text plans are not labeled outages.

Admin-only health metrics expose version/tombstone lag, oldest lag, pending projection events, provider availability and nullable indexed-document count. Database version coverage alone does not prove provider health; unavailable provider statistics remain null, not zero. Public callers cannot read operational metrics.
