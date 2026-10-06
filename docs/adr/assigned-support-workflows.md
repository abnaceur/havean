# Assigned support workflow and private notes (S02)

Administration owns support-case state, public history and immutable internal notes.
Inventory retains listing ownership; support actions never alter availability.
The existing session BFF and generated SDK carry all native UI actions.

## Admission and state

Current active platform support membership is checked and locked in the API and
SQL. A forged token role does not grant membership. Open cases can be triaged by
current staff; subsequent private actions require the current assignee or actual
platform administrator. Handoffs lock the active target membership. Reporter
comments require the original reporter and an active case. Only that reporter can
reopen a resolved case, returning it to open/unassigned. Public APIs accept only
comment/reopen payloads and reject internal-note fields.

Every action locks the case and checks its submitted version. Updates advance one
version, append attributed public history and a redacted audit event in one
transaction. Receipt replay returns the committed response without another action.
Escalation/de-escalation are triaged/escalated transitions; resolution is terminal
until the reporter reopens. Original case description/listing/attachment bindings
remain immutable. Stale competing actions cannot both commit.

## Private notes

SQL 151 admits a private note only in the same transaction as the corresponding
versioned root note action; a deferred constraint requires that atomic note.
Notes are immutable. Current assignment and actual administrator membership gate
both SQL reads and API serialization. A previous assignee loses note access on
handoff. Historical root notes have explicit unknown timestamp/version metadata.
Public history carries a generic status_updated action and null message for a
private note, without its text or private action name. Reporter serializers omit
the internalNotes field altogether. Audit payloads contain version/state only.

## Queue and export

Native URL filters preserve status, category, current assignee and page. Queue
pages contain at most 20 current scoped cases. Export uses the same filters/current
staff gate and returns complete metadata up to 10,000 rows; larger results refuse
with an actionable narrowing message, never a truncated success. CSV contains only
case UUID/version/category/status/timestamps/assigned boolean. It excludes subjects,
descriptions, messages, notes, actor identifiers and attachment object keys. Cells
are quoted and spreadsheet formula prefixes neutralized. The binary CSV operation
is typed in the SDK/OpenAPI and excluded from JSON envelope parsing; no-store is
mandatory. Reporter requests for assignee filtering are rejected.

O/R: benchmark support entry and supplied capability names only. P: these private
operational workflows. V: no benchmark private support workflow parity claim.
