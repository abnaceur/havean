# CRM queue, notes and timeline

O: L02 requires scoped leads, validated stages, safe professional notes,
assignment handling, filters and stable event history.
R: supplied API authority, version and workflow contracts.
P: synthetic assigned/foreign leads and actual database/identity journeys.
V: benchmark private CRM screens are not available for exact parity.

Authority is checked against current active memberships, profile state and the
selected organization's type. Agents see assigned leads; personal ownership does
not broaden professional access. Agency managers, developers, vendors and actual
administrators have their applicable organization scope. Role strings cannot
broaden a supplied actor's actual membership. Membership/profile rows are locked
during the transaction. Legacy lead reads use the same explicit scope.

The queue uses parameterized contact search, stage, destination and assigned-agent
filters. It sorts by creation time descending then ID and serves 50 records per
page. Pagination reflects current data; it does not promise a frozen snapshot
when new records arrive. URL filters and the selected inquiry survive refresh.

Stage updates require the current version and an allowed transition. Notes require
the current version, active authorized professional scope and an open workflow;
adding a note increments the lead version. Both mutations use idempotent receipts.
Notes are plain text and render through React text nodes. No note text is put in
audit/outbox payloads or personal account exports.

Migration 085 records real new creations, stage changes and assignments. API note
inserts append their actual text, actor, version and database timestamp. Historical
activity is not backfilled with fabricated events. The UI states when an earlier
timeline was not recorded. No application UPDATE/DELETE policy permits editing
history; an update trigger also protects owner edits. Child deletion only follows
an authorized deletion of its lead, preserving privacy cleanup compatibility.
Database guards independently reject non-professional or skipped stage changes.
Controlled staff fixtures may model historical or reset states; API administrators
still pass the same workflow transition checks.

Reassignment retains existing team context and transfers access with the current
lead assignment. The previous agent immediately loses detail/timeline access.
Creation and team notification remain the L01 inquiry transaction; CRM notes do
not create customer messages. All displayed dates are labeled UTC.
