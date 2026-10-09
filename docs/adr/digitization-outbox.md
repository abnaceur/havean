# Inventory digitization outbox routing

Use the `digitization.` event namespace exclusively for inventory-owned processing
commands. Contracts expose the consumer/queue name `digitization`. Existing listing/
property projections, alerts, reminders, expirations and other platform events
retain their existing platform effects and BullMQ outbox queue.

The generic processor rejects engine events before applying effects/acknowledging.
The ordinary recovery relay excludes that namespace. Unknown engine versions also
remain unacknowledged for explicit engine handling. Current intake/input/draft graph producers emit redacted engine activity events. No executable stage-dispatch producer/consumer is registered yet. Activity events and stage commands need explicit distinct handling; unknown kinds must remain unacknowledged. This prevents losing future commands while the C02 coordinator/consumer
is implemented; it is not a completed execution dispatcher.

C02 must register the dedicated queue on the existing Valkey connection, relay
stable outbox/stage IDs, and retain DB stages as authoritative state. The consumer
owns a distinct outbox_effects identity (`digitization`), never `platform`. It can
commit dispatch acknowledgement only after the API-owned stage lease/dispatch port
accepts the intended revision. Stable BullMQ IDs suppress duplicate queue work;
API stage lease/fencing/execution ID must suppress duplicate runner processes. An
outbox acknowledgement alone cannot prove a stage executed. Redelivery/crash before
enqueue, queue loss and consumer effect races require real C02/C04 tests. A future
unsupported engine event must fail closed, not acquire a successful noop effect.

R06 remains in progress until real duplicate engine delivery produces exactly one
execution through the registered consumer. Current tests prove unswallowed commands
and preserved duplicate platform effects only; they do not substitute for that
acceptance.

O: no original capture. R: inspected main/processor and supplied scheduling protocol.
P: real DB routing assertions. V: full engine execution/recovery still unverified.
