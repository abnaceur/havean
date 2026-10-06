# Deposits are recorded liabilities

P10 treats deposit evidence independently from rent charges, payment evidence and
allocations. Received evidence increases held liability; released evidence decreases
it. An adjustment requires an explicit increase or decrease direction and a reason.
Every posted movement is immutable and retains actual actor/time, exact NUMERIC
amount/currency, lease/unit/grant versions, liability sequence and before/after held
amount. The liability version is the count of all retained movements for the lease.
No mutation deletes history, so a serialized new movement receives count plus one.

Actual current finance membership and property authority protect ledger reads,
posting and committed receipt replay. Fresh mutations compare all source versions
and the current liability version under the shared lease finance advisory lock.
The database independently repeats actor, scope, version, state, currency, exact
before/after and nonnegative held checks. Simultaneous releases cannot both spend
one held balance. Source money strings go directly to PostgreSQL NUMERIC arithmetic.
No funds are transferred and no deposit enters rent-income totals.

Historical received/released entries retain their known movement meaning. Prior
adjustments without direction continue the earlier decrease convention in balances,
with that convention stated in the ledger. Their native source sequence and held
before/after remain null; the UI labels that provenance unavailable. A privileged
migration fixture tests this compatibility without weakening runtime admission.

The native ledger uses bounded 20-record pages, scoped active/ended lease selection,
explicit confirmation and a retained receipt key after lost acknowledgement. Invalid
or excessive movements retain inputs. Refresh obtains current authority and liability
version; recorded entries remain visible after confirmation. Tenant statement totals
continue to expose deposits separately. Full tenant portal and period statement
contracts belong to P11/P14.

O: no original deposit screen observed. R: no benchmark deposit workflow retrieved.
P: exact liability evidence, confirmation and retained history. V: original-site
parity, external CI and production deployment remain unverified.
