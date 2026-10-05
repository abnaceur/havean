# Inventory revisions and history

Published core facts remain the current public revision while an assigned author proposes changes. The proposal records its listing version and its own version. Independent review must confirm both before atomically applying the whitelist of revised facts. Withdrawal or intervening publication changes prevent stale approval. Rejection leaves the current public revision intact.

Listing state, audit and outbox writes share a transaction. Approved price changes append exact PostgreSQL NUMERIC amounts once per revision; an unchanged numeric price does not create a false price event. Idempotency keys replay completed HTTP decisions without repeating effects. The worker projects the authoritative current revision and its version.

Status and price events are append-only. Neither the application nor an ordinary database actor can update or delete past events. Archive preserves inventory history. Public projections contain approved asking prices, generic public reasons and public availability states; they omit actor identities, private proposals, ownership documents and internal review notes. Asking prices are explicitly distinguished from completed sale prices.

The default development policy retains history for the listing's lifetime, including archival. No automatic history purge runs. Production data retention and any identity anonymization are governed by the deployment's approved retention configuration; account identity changes must preserve these event amounts and ordering. Backup and restore include both history tables. Production launch checks must verify the configured retention policy.
