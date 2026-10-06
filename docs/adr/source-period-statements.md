# Recorded owner, tenant and management statements

P14 statements read one exact active/ended lease and one immutable lease currency.
Current active profiles and exact current owner/property service grants admit owner
reads. The grant must match the lease's organization, and current inventory owner
authority must remain valid. Current actual property manager/finance membership and
property service grants admit professional reads. A verified original linked tenant
retains its own active/ended contract history when professional service ends.
Supplied actor role labels cannot replace these persisted checks. Admission locks
actor, lease, grant and relevant owner authority before reading source records.

`owner_statement_unit_valid` is a narrow inventory-owned read port for current
owner authorization. Management owns lease/grant admission and report projection.
The owner lease RLS policy now applies the same exact organization/current grant
scope; reports do not expose drafts, staff identities, references or private reasons.

## Period and reconciliation

The explicitly displayed date basis is **recorded ledger time in UTC**, inclusive
from/to calendar dates. Charges use stored creation time. Posted payment evidence
uses recorded posting time, or stored creation time when original historical posting
time is absent. Allocations use creation time and linked undo uses reversal time.
Deposits use their stored recording time. Rent period and due date remain separate
informational fields. The default start is 1970-01-01 and the API resolves an omitted
end to the current UTC day; the contract contains no changing daily generated default.

One PostgreSQL statement snapshot projects originals and negative linked corrections
and aggregates opening, selected-period movements and closing balances. Each balance
includes net charges, recorded evidence, allocations, outstanding (charges minus
allocations), credit (evidence minus allocations) and separate signed deposit liability.
The closing balance includes all stored entries through the selected end date; it
does not depend on the page. Money stays NUMERIC/string with two decimal places;
large totals are not narrowed to NUMERIC(18,2) or converted through JavaScript numbers.
Different leases/currencies are never combined. A historical currency conflict on
one lease explicitly refuses the report and requests a ledger review.

Original records and timestamps remain intact. Unknown historical actor/posting
provenance is labelled, and directionless historical deposit adjustments retain the
original decrease convention. Entry versions are current stored source versions,
not invented historical versions. Original allocation entries and later undo are
separate signed events; later reversal does not erase an earlier period's balance.

## Interface and exports

The shared typed interface is available in owner account statements, the linked
tenant portal and the management lease dialog. Actual account/lease/period/page keys
scope queries. Explicit date submission and pagination update the URL; reload
restores the selected recorded period. Exact strings render under the lease currency.
Twenty entry rows have bounded paging and full totals. Legacy statement arrays remain
bounded projections of those same page entries for existing internal callers.

Authenticated CSV and full HTML print endpoints recheck current scope for every
request and use one complete report snapshot. Both include lease version/status/term dates and source IDs, linked
corrections, versions, period, scope, snapshot and all opening/movement/closing totals.
They include all selected entries up to 10,000; larger requests fail explicitly,
without a partial export. CSV quotes fields and neutralizes formula-like labels;
HTML escapes all source labels and has a no-script CSP. Print is an English HTML
document with noindex, repeated table headings and browser print/save-as-PDF support.
Private responses use no-store. Session BFFs preserve the print document's CSP.
The API wire-response hook treats these validated report exports as binary/text
operations, rather than attempting to parse CSV or HTML as JSON.

O: no original private financial statement screen observed. R: no private report
benchmark retrieved. P: API-owned source-period reconciliation and scoped complete
CSV/HTML print. V: original-site parity, remote CI and production deployment remain
unverified; deployment is deferred under the user's push-only instruction.
