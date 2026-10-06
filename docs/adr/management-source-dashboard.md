# Management source dashboard

P15 is an API-owned dated report exposed through the typed server-session SDK.
Both the professional overview and the management Dashboard tab use the same
endpoint; the older overview route delegates manager/finance actors to this report.
Persisted active manager/finance membership in the selected manager organization
is required. Supplied role labels and foreign selected organizations cannot admit
reads. Current exact property grants scope every source, including historical dates.
An admin label does not turn this endpoint into a global aggregate.

## Definitions

The default date is resolved at request time, not baked into generated contracts.
The UI shows selected date, inclusive end of day UTC, snapshot and all definitions.
Explicit date submission writes the URL; reload restores it. Account/date query keys
and zero cache retention prevent another account's report being reused.

Occupancy counts distinct currently granted unit records, including rooms. The
inventory-owned boolean/status source port respects parent/room exclusivity without
returning foreign contracts or identities. Contract dates and recorded activation
and ending bound occupation. Older ended contracts without recorded ending time
produce unknown history rather than fabricated vacancy. Unknown, occupied and
vacant counts reconcile to granted units.

Arrears are positive outstanding original posted charges through the selected day,
less dated linked charge corrections and allocations effective then. An allocation
undone later remains effective in earlier reports; undo restores current debt.
Unallocated payment evidence does not settle rent, and deposits never enter rent
aging. Buckets are today/future due, 1–30, 31–60, 61–90 and over 90 days overdue.
SQL NUMERIC is formatted directly as decimal strings; currencies stay separate.
Conflicting historical charge/lease/payment currencies and cross-lease allocation
links require review instead of combining.

Maintenance uses latest immutable public status through the same day. An aggregate
source port admits current manager or finance teams but returns no private text,
identities or resource IDs. Older requests lacking dated public history are counted
as unknown. Current requests/notes are never substituted for missing past evidence.

The initial source plan expanded charge balance expressions repeatedly and had
2492 JIT functions. Materializing charge balances prevents repeated expressions;
this report disables transaction-local JIT and indexes linked allocations and scoped
records. Initial integration outcomes and the diagnostic plan are retained; they do
not constitute release-scale performance measurements.

O: no original private management dashboard observed. R: no original private report
benchmark retrieved. P: dated current-scope occupancy, currency-separated aging and
maintenance status with explicit unknown history. V: original-site parity, remote CI
and production deployment remain unverified; deployment remains deferred by the
user's push-only instruction.
