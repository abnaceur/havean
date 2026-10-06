# Lease renewals and ending history

P05 replaces unversioned renewal/ending paths with native API workflows. Actual
current manager membership and exact property authority are checked before receipt
replay. Canonical group locks precede lease row locks. New writes check lease
version and workflow state; renewals also check current unit/grant/tenant versions
and canonical currency. Decimal rent remains a string backed by NUMERIC.

A renewal creates a new draft, linked to the retained previous term with its
version, actor, timestamp and reason. It starts strictly after the original end
and cannot overlap active occupation. One successor per term prevents duplicate
renewals from separate concurrent requests; further renewals form a chain.
Database guards retain the date ordering during subsequent draft edits. Original
terms, documents and financial roots stay on the old lease. The new draft can
receive its own private documents through the existing draft editor and requires
separate confirmed activation. Files are not silently granted to a new lease.

Ending records completion or termination, actual actor/time, reason and the new
lease version. Status, immutable history and audit/outbox commit together. A runtime
state guard requires the ending record, denies resurrection and protects activated
terms. Ending does not update rental listings: leased offers remain withdrawn.
Explicit availability review is recorded and shown; publication still uses the
existing eligibility/moderation workflow. Current authority also protects retries.

Historical leases can be ended and renewed using their actual stored terms and
current valid authority. Unknown original due day/creator/source metadata remain
unknown. No synthetic original approval or history is fabricated. Native renewals
of historical leases record new known authority. The history view labels this
provenance distinction and keeps the previous/next term links visible.

SQL 117 adds immutable renewal and ending records; additive 118 requires versioned
ending metadata for runtime state transitions. Native desktop/mobile forms retain
inputs and receipt keys after lost acknowledgements. Reference/private operations
parity and deployment are unverified; screenshots are local provisional evidence.
