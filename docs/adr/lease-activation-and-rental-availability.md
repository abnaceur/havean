# Atomic lease activation and rental availability

P04 replaces the incomplete activation route with a confirmed, versioned native
workflow. Current actual manager membership and resource authority are checked
before receipt replay. New activations recheck draft state, stored and current
unit/grant/tenant versions, canonical currency and the market's calendar date.
Expired terms cannot activate. No funds are transferred.

The canonical rental group advisory lock precedes the lease row lock. A database
trigger enforces inclusive active-term intervals for the same unit, parent property
and child rooms, including privileged writes. Sibling rooms can hold separate terms.
Concurrent overlapping activations yield one success and one conflict. Activation,
immutable lease history, audit/outbox and withdrawal of incompatible published
rental offers commit together. Inventory owns the narrow withdrawal port; management
does not directly mutate inventory tables. Each withdrawn offer receives versioned
status history and an event attributed to the actual manager. Public projection
excludes occupied offers immediately; search invalidation uses the existing outbox.

Native desktop/mobile confirmation retains a stable receipt key and confirmation
when acknowledgement is lost. Replay returns the committed result without another
activation. Revoking the property grant denies subsequent receipt replay. Draft
creation and editing also recheck current authority before their cached receipts.

SQL 116 is additive. Source fixture publications in database/browser setup are
synthetic privileged test facts, not evidence of moderation approval. Screenshots
are provisional local evidence. Renewal, ending and finance follow separately;
original-site parity and deployment remain unverified.
