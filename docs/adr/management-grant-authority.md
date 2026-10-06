# Management portfolios and grant authority

P01 uses canonical inventory units; creating or renewing a management grant never
creates a property. One retained root per organization/unit records an exact owner,
versioned owner authorization, public unit facts, consent, expiry and immutable
versioned activity. Renew/revoke operate on that existing root with actor, resource,
version and state checks. Matching request receipts recover lost acknowledgements.

Inventory owns owner authorizations and unit facts. Its read-only management port
locks the current source and canonical unit and returns bounded public facts and
versions. Management owns its roots/activity. PostgreSQL definer functions recheck
actual active owner and manager memberships rather than trusting actor role labels.
The management admission port locks current team/grant/source authority for writes.
Org-scoped lease/finance RLS follows valid grants, including finance-only sessions.
Tenants retain their separate personal read policies. Owner grant history remains
available after professional access ends; privacy export includes that history.

Native grants require the exact active, unexpired owner source/version. Changing or
revoking that source ends professional access; fresh consent/renewal is required.
Historical supplied grants lack original consent/start/source metadata. They remain
explicit recorded authorizations until their recorded expiry and are labelled as
legacy; no source, creation date, consent or history is fabricated. Renewing a legacy
root requires current owner authority and records only the new action.

SQL 106–107 are preserved; additive 108 uses the existing `manager` organization
type, and 109 covers dependent finance read scopes. No release/production/parity
claim follows from synthetic fixture evidence. Detailed financial workflows remain
P02–P15 contracts.
