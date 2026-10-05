# Inventory expiration

Publication expiration is an inventory-owned PostgreSQL transition invoked by the worker through `expire_scheduled_listing`. Only the worker's authenticated admin context may invoke it. The function locks the listing, matches its current deadline and state, and writes the new version and immutable history. The worker adds audit/outbox events in the same transaction through the established event port. It imports no API internals.

The dispatcher polls due publications every two seconds and queues a job keyed by listing/version. Job payloads preserve the full PostgreSQL deadline text. A changed deadline, a future deadline, a withdrawn listing or a completed transition produces no effect. Rescheduled jobs and duplicate queue deliveries are safe. Republished properties start with no inherited expiration deadline; authors can set a new one.

Public discovery and the locked inquiry/booking destination also check the deadline directly. Queue or search lag cannot allow a new inquiry or viewing after the deadline. Existing SQL reads use no-store responses; search projections remove unavailable documents using current authoritative state. Full search recovery remains task D10.
