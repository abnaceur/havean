# Payment evidence drafts and posting

P07 replaces the old direct posting route with distinct native draft, edit and
confirmed posting contracts. Actual current finance membership and the current
property grant protect every operation and receipt replay. New mutations check
payment/resource versions, immutable lease identity and workflow state. Source
versions include the lease, unit and grant; currency follows the retained lease.
Amount is a positive decimal string backed by NUMERIC. Floats/scientific notation
are not accepted. Sources and references describe bookkeeping evidence, not transfers.

Drafts have no effect on statements and are private to currently authorized finance
staff. Tenant and owner reads do not expose draft rows. Posting locks the current
saved draft, rechecks authority and records actual actor/time. Immutable versioned
snapshots retain original and edited values with audit/outbox in the same transaction.
Native receipts preserve successful writes after acknowledgement loss; concurrent
fresh attempts yield one post. Revoked grants deny replay. Posted amount/source/
identity data cannot change, including privileged attempts; use separate reversals.

Historical posted rows retain known recorded facts and unknown original posting
actor/time/source-version metadata. No posting history is fabricated. Native drafts
can be recorded for active or ended retained terms within current management scope.
The draft editor saves current authority before posting after a source change.
Draft payment evidence cannot be allocated or reversed. Posted-only statement queries
and restrictive draft read policy keep balances and personal reads accurate.

SQL 122 adds source/posting metadata, retained history, actual finance read/write
checks and immutable posted-state guards. The lower-level exact-decimal fixture now
uses a privileged actor for its explicitly legacy synthetic posted insert; runtime
inserts require the native draft contract. New forms use scoped server-session API
contracts and retain inputs/confirmation and receipt keys after failed responses.
Screenshots remain provisional; original-site parity and deployment are unverified.
Allocation, reversal and deposits retain their separate pending acceptance contracts.
