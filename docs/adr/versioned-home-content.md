# S03 — home sections and taxonomy

Administration owns draft/published home sections, eligible editorial categories and
immutable revision history. Geography consumes administration's narrow public
section/taxonomy projections; content_source is an inventory/development public
eligibility port. It returns only a boolean and checks current public inventory,
version, active geography, currency, city and category. Publication locks the source
and current category. Browser selection and preview use existing public SDK reads;
Next implements no eligibility or publication business rule.

Actual active platform editor/admin membership, current profile and membership locks
are required, independently of token role labels. Create requires version zero;
edit/publication/archive/taxonomy require the current version. Original section city
and creation provenance cannot change. Archived roots are retained and immutable.
Every admitted editor change automatically appends an exact actor/time/version/root
snapshot in SQL; those histories cannot update or delete. Redacted outbox/audit
records contain only scope/category/version/state, without editable copy or notes.

Draft edits retain the current publication snapshot. Publish rechecks eligibility
and freezes the draft's English title/copy/category/order/UTC schedule/selections at
the new root version. Public reads use that frozen snapshot, active taxonomy and
current interval. They recheck source versions/public eligibility before returning
current public property cards; changed/withdrawn sources disappear and empty
editorial sections are omitted. No drafts, actor IDs or organization IDs are public.
Schedule expiry is evaluated at each source read and needs no fragile delayed job.
Sections order by recorded position then UUID; selections retain their explicit
order. Up to six unique selections per section and 100 retained sections per city
bound reads. Commercial/sale/rental/development categories have explicit eligibility.

Taxonomy configures English labels and eligibility for those known categories.
Disabling editorial eligibility hides relevant editorial sections and blocks new
selection/publication; it does not silently withdraw inventory or change discovery
route semantics. Bootstrap category records retain explicit unknown attribution.
New cities can initialize missing categories with an actor/version-zero operation.
External link fields and unknown categories are rejected; CTA routes are generated
from the city and known category. User copy renders as text, not executable HTML.

Native interfaces preserve failed draft inputs and receipt identity, show public
property titles/current version in private preview, distinguish published versus
edited copy, and provide loading/empty/error states. Exact benchmark private editor
workflows are P/V. Existing approved local consumer baselines remain preserved;
new editorial data is a separate proposal, not a claimed parity approval.
