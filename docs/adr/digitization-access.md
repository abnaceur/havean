# Digitization scope and private-evidence authority

Inventory owns property-access.ts. Rich media reuses its existing editableProperty
port without altering legacy author/review behaviour. Engine listing access is a
separate current-grant check: active profile and transaction actor, actual selected
agency membership, matching listing organization, current assigned agent (manager
may act on team targets), or current recorded owner-to-unit grant. A canonical unit
shared across mandates does not confer access to another organization's listing.
Admin role labels, including the search workerActor, do not create engine authoring
rights. Actor roles must match persisted membership. Development/floor type and
private-intake adapters retain explicit target types; no ID aliasing.

The engine document preview port requires approved scanned private document purpose,
current active profile, asset ownership or an active explicitly granted legacy
reviewer document scope, plus persisted reviewer/admin membership. A supplied
listing further narrows access and requires its current owner/author authority;
it never opens that listing owner's documents to an agent. Owner document access
without a listing remains access to their own uploaded evidence. Completed/expired
reviewer grants fail. A listing-scoped owner whose unit grant expires cannot use
that target to preview/author. Private evidence stays in existing storage and no
object key is returned by this port. Existing credential-evidence grants retain
their own policy, not authorization to process a property deed.

## Explicit processing-grant contract for HE-A04/B01/C03

Preview authorization and agency membership must never be translated implicitly
into runner processing permission. Inventory must persist an explicit versioned
engine grant binding the source asset/owner, organization/resource-grant scope,
target type/ID and purpose (preview or document-processing), current granting actor,
expiry/revocation, originating owner/submission review authority, and allowed source
revision. Grant creation rechecks asset ownership or the specifically delegated
owner evidence policy; reviewers' temporary read grants alone cannot delegate
processing. Agency uploaders may process their own rights-attested uploads; owner
submission documents require the owner-specific port. Grants cannot follow a unit
to another mandate or development. Deletion, reassignment and evidence authority
revocation invalidate affected capabilities and approvals.

The API will mint short-lived run/attempt/stage/asset/revision/checksum-scoped
capabilities only after rechecking those grants in a short actor transaction.
The Python runner receives no user session, DB credential, admin worker identity,
arbitrary bucket/key or publication grant. Its service identity can fetch only the
job's allowlisted source and submit authenticated progress/results. API-owned
internal commands recheck current grant, lease/fence, cancellation and source
revision on every renewal/commit. Expired/reassigned authority denies completion;
late outputs remain private or discarded. Capability signatures alone cannot
replace current database checks. There is no active processing port at HE-R02;
HE-A04/B01/C03 implement this grant ledger and narrow service identity before any
real engine dispatch. This ADR is not a claim those future ports already exist.

O: no original private workflow capture. R: platform owner evidence and supplied
engine scope requirements. P: real current-grant access tests. V: production,
new UI and full engine security/publication acceptance remain unverified.
