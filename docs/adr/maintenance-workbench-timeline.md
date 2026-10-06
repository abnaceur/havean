# Maintenance workbench, public progression and private notes

P13 completes the manager queue with bounded status, urgency, category and actual
assignee filters. Filters, page and selected request restore from the URL; operations
also restore the selected management tab. Initialization reads the URL once before
fetching, including development effect replay. URL writes occur only in explicit
user actions. The shared TanStack Query client keys queue results by actual account,
professional scope, page and all filters; request cancellation follows query changes.
Account-scoped keys and zero cache retention avoid exposing prior account results. Queue
reads batch bounded summaries and one current team roster; full photos/activity
and private notes load only when an authorized detail view opens. Every returned request is checked against
current persisted membership, property grant and lease scope. Tenant filters cannot
turn a private team assignee identifier into access to another request.

Managers follow open → triaged → assigned → in_progress → resolved → closed/reopened;
reopened returns to triage or assignment. Same-state updates permit a new public
comment, private note or actual same-team reassignment; empty unchanged commands
are rejected. Closed cases do not accept further updates. Optimistic request and
lease/unit/grant versions, current actor authority and transaction receipts protect
mutations. Every committed request version retains exact public activity and audit.

Original linked tenants on active leases with a current service grant can append
public comments, and reopen resolved cases with an explanatory reason. They cannot
assign staff, change original request identity, change other workflow states or
modify a closed request. The same rules protect raw runtime SQL admission. Existing
history remains readable when professional service authority ends, with write
controls unavailable. Grant/link admission is checked before receipt recovery.

Private notes append immutable rows under actual current manager/property scope.
They appear only in the professional projection; tenant list/detail responses omit
the entire private-note field. Tenant UI receives public progression and comments.
Historical legacy notes remain available to the authorized team with original
actor/time/version explicitly unknown; no migration invents those facts. Native
notes retain actual request version, actor and database timestamp. Public updates
never copy private note text. Source/root/history/note/audit changes commit together.

SQL 140 extends current actor/source/version admission for public comments and
reopening. Additive 141 explicitly rejects null tenant comments and bounds native
public note text. Additive 142 binds each private note to the same transaction as
an admitted request version update; a standalone append to an already closed request
is denied, while a note accompanying an authorized closure can commit. Previously
applied migrations are preserved. Long maintenance
histories retain a bounded independent dialog scroll surface. Direct inset positioning
avoids transformed mobile coordinates, and a sticky header keeps the close control
available on long timelines. Scoped filter/action rows wrap rather than inheriting
the operations table action row minimum content width. Viewport checks compare to
the configured browser width, rather than an innerWidth enlarged by overflow.
Inputs survive failed acknowledgements and matching receipt retries.

O: no original private maintenance screen observed. R: no benchmark workbench
retrieved. P: versioned queue, progression, comments, private notes and tenant reopen.
V: original-site parity, remote CI and production deployment remain unverified.
