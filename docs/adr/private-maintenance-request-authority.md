# Maintenance requests and private photos

P12 replaces unversioned request/triage routes with a typed tenant/manager workflow.
A tenant must be the current verified active lease account and a current management
service grant must exist for creation. Actual current managers need their assigned
organization/property authority. Lease, canonical unit and grant versions protect
native confirmation and receipt replay. Manager-created requests retain a management
creator and the linked tenant as requester; they do not impersonate tenant creation.

Requests start open. Current managers triage, then assign to an actual active manager
in the same team. Request and source versions, current role/grant and valid workflow
transition are checked before updates; every version commits matching immutable
public activity and audit/outbox. History copies the exact database timestamp in SQL,
avoiding JavaScript timestamp truncation. Original title/description/category/urgency,
creator and resource identity stay immutable during workflow updates. Full completion,
reopen, queue filtering and private-note workbench acceptance belong to P13.

Up to six exact owned, approved, scanned private JPEG/PNG assets bind at creation.
Captions and asset versions are retained. SQL rejects foreign, unapproved/public or
wrong-purpose media and later attachment rewriting. Private view uses a narrowly
scoped management-owned port, current account/team/property authority and locked
request/lease/grant/asset bindings. It streams the sanitized WebP display variant,
not the original file/metadata. Rejected/revised media cease to be served. General
public image endpoints cannot expose private uploads. Tenant reads of their existing
request remain available after professional authority revocation; new service requests
and professional reads/mutations deny without a current service grant.

Tenant projection contains only public update/activity and its private approved photo
links. It omits internal legacy notes, actor/org identifiers, storage keys and the
staff assignee roster/IDs. Private-note storage has separate manager-only RLS and
immutable rows; the workbench does not expose that feature until P13. Query pages
are bounded to 20 records. A scoped lease filter permits contextual request creation
without bypassing membership, grant or tenant-link checks.

SQL 136 provides the foundation. Additive 137 locks private-photo admission and
protects note append authority; 138 uses the tenant's definer lease lock port rather
than granting lease UPDATE RLS; 139 evaluates new-row RETURNING scope from actual
actor/lease fields. Applied migration files remain immutable. Source and UI inputs
are retained after failed acknowledgements using stable receipt keys. No response
is confirmed before transaction commit.

O: no original maintenance screen observed. R: no benchmark private workflow retrieved.
P: scoped versioned requests, approved private photos and actual team assignment.
V: original-site parity, remote CI and production deployment remain unverified.
