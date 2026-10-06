# Linked tenant lease projection

P11 uses a dedicated typed API for active and ended leases linked to the actual
verified active account. Neither declared staff roles nor an owner grant gives a
caller access to the tenant projection of another account. Draft terms/documents
and unposted payment evidence remain private. Current tenant linkage is checked on
every read; source admission locks the lease, tenant and profile while detail is
assembled. Revoking a professional management grant does not remove an otherwise
valid tenant's recorded contract access.

One SQL snapshot derives charge/payment/allocation/deposit totals, counts and
bounded 20-record history pages. Linked reversals remove originals from active
money totals while both originals and corrections remain labeled in history.
Amounts stay decimal strings; PostgreSQL NUMERIC supplies arithmetic. Charges,
payment credit and held deposits remain distinct. The snapshot timestamp is the
actual database statement timestamp, not a performance measurement.

Tenant history omits staff-entered receipt references, deposit/correction reasons,
actor IDs, organization IDs, internal notes and object keys. Legacy tenant generic
statements redact staff references/reasons too. Owner statement presentation remains
available for its existing authorized source scope; period reporting remains P14.
The web only renders the API projection through its existing server-session BFF.
There is no transfer/provider button because the platform records evidence only.

A management-owned tenant document port admits only the exact lease/asset binding,
matching current asset version, scanned approved private PDF and active/ended own
lease. Download admission locks current profile, tenant, lease and asset/binding.
It returns narrowly scoped metadata to the API's private object-storage reader.
It grants no general media inventory/mutation or ownership-document access. Every
download uses current session authority, no-store headers and retained audit.
Rejected or revised assets stop being listed/downloadable; another lease cannot
reuse the URL even for the same tenant.

The native selector and evidence pages retain the selected lease in the URL. An
authorized saved selection outside the current list page remains visible using the
returned detail summary. Query cache keys include the actual authenticated account
ID, avoiding reuse across account changes. Refresh retrieves current balances;
private failure/loading/empty states do not invent financial values.

O: no original management tenant portal was observed. R: no benchmark private lease
or document workflow retrieved. P: own-lease projection and scoped PDFs with exact
recorded balance. V: original-site parity, external CI and production remain unverified.
