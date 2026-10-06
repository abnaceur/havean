# Payment allocations and retained credit

P08 allocates posted payment evidence to posted charges on the same retained lease
and currency. Every request and receipt replay checks actual current finance
membership and current property authority. New writes check lease, unit, grant,
payment and charge versions plus explicit confirmation. Decimal strings and
PostgreSQL NUMERIC retain exact cents; partial settlement leaves both outstanding
charges and unallocated payment credit visible. Neither credit nor allocation
represents a funds transfer or permits a cross-lease movement.

A shared lease finance advisory lock serializes allocation and existing linked
reversal operations before payment/charge row locks. API capacity checks reject
excess as conflicts; SQL independently enforces both payment and charge caps,
current sources and immutable allocation amounts. Allocation undo retains the
original row, advances its version and records the actor/time only after a linked
reversal exists. Full native reversal acceptance remains P09.

The ledger calculates eligible posted non-reversed sources, active allocations,
totals and bounded independent payment/charge pages in one SQL statement, keeping
all monetary values on one database snapshot. Native confirmation retains its
idempotency key after a lost response and refreshes balances after acknowledgement.

Tenant choices for lease drafting now query property-linked accepted invitations
and existing leases directly, preserving current grant and RLS checks. This avoids
scanning unrelated retained tenant history; no performance threshold is claimed.

SQL 123 adds attributed source versions and retained undo metadata. Legacy rows
retain unknown original allocation metadata. Synthetic integration charge fixtures
exercise allocation integrity; the browser journey generates its charge through
P06 and records/posts its payment through P07. Screenshots are provisional local
workflow evidence. Original-site parity and deployment remain unverified.
