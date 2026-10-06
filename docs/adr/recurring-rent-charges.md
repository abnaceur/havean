# Configured recurring rent charges

P06 replaces the old unversioned bulk generator with a bounded, versioned preview
and confirmed posting workflow. Actual current finance membership is locked and
checked, including finance-only professionals. Property managers without finance
cannot post. Every selected lease is currently scoped by its valid management
property grant. Actor/resource authority is checked before receipt replay; new
writes recheck lease, unit, grant and market configuration versions and active state.

Canonical geography owns the market configuration port. Market settings specify
calendar-day proration or full monthly rent for an occupied period and an explicit
historical due-day fallback. Native leases use their recorded due day. Historical
unknown due days remain unknown; the applied configured fallback is labelled and
snapshotted. Due date is the scheduled monthly day, moved to the first occupied day
when a term begins later. Preview shows policy versions, exact amounts and due dates.

Proration uses integer cents and calendar day counts, with half-up rounding to one
cent; no floating point amount is posted. Inclusive intersected lease dates handle
leap months. Out-of-term and ended leases are excluded. New recurring charges store
actor and immutable source/policy/calculation snapshots. Existing financial records
keep null original generation metadata; no historical provenance is fabricated.

Lease locks and PostgreSQL's lease/period/type uniqueness serialize repeated and
concurrent generation. Repeating a month retains the existing original charge;
matching receipt retries return the original committed result without another event.
A batch is atomic, with stable ordered resource locks. Reversal workflows remain
separate and do not silently generate another original charge.

Native paginated preview retains selections and confirmation after lost response.
Existing charges are clearly marked and cannot be selected again in this form.
SQL 119 adds configuration defaults, actual finance locks, source admission and
immutable charge evidence. Additive SQL 120–121 applies and validates explicit policy
defaults on new market insertion, including fresh seeds. Original-site parity and deployment remain unverified.
