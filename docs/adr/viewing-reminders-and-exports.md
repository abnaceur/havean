# Viewing reminders and professional CSV reports

## Reminder source and delivery

Confirmed future appointments with recorded reservation provenance schedule one job
per booking version. The due time is 24 hours before the appointment, or immediately
when confirmation is within that window. Existing future confirmed rows with that
provenance are backfilled; unknown historical reservation metadata is not invented.
Cancellation, rescheduling or a terminal transition cancels pending jobs atomically.
Already accepted messages remain actual historical provider receipts.

The worker only discovers and dispatches signed API jobs. The API owns eligibility,
recipient checks, payload freezing, retries and mail integration. These are necessary
transactional reminders, like inquiry receipts; optional discovery-alert preferences
do not suppress them. Only active verified account email is used, never inquiry-form
email. An active account without verified email receives the native notification.
Inactive accounts and unavailable/current-agent-ineligible properties are cancelled.

Prepare commits frozen content and attempt state. Delivery rechecks under the same
agent advisory lock and booking row lock used by calendar actions. These locks remain
held across bounded provider lookup/send calls: cancellation that has committed
prevents a new send; cancellation racing an already-started send waits for it to
finish. A message accepted before cancellation cannot be unsent. Every retry checks
a stable provider message ID first, including recovery on the fifth attempt after a
lost acknowledgement. Failed lookup/send is unconfirmed, with bounded backoff and
five attempts. Mailpit is the development receipt provider; production requires the
configured idempotent provider. Acceptance does not imply inbox delivery or reading.

Private frozen payloads have service-only RLS. Personal export uses an exact actor
port exposing reminder timing/state and no frozen recipient/payload. Account removal
continues through the existing retention workflow; deleting a viewing cascades its
jobs while notifications retain their separate retention policy.

## Exports

Inquiry exports reuse the CRM queue query and actual active membership authority.
Managers see their organization's team; agents see their actual current assignments.
Viewing reports reuse the calendar's exact professional scope and property-local
status/date filters. One query per dataset provides a source snapshot, bounded at
10,001 rows; over 10,000 explicitly fails and asks for narrower filters. Export has
its own strict query contract with no page parameter and does not silently export
only the displayed page. Browser downloads use the existing server-session transport.

Whitelisted columns omit private notes, inquiry messages and reminder payloads.
All cells use RFC 4180 quote escaping and neutralize formula-leading characters,
including whitespace/control prefixes and contact telephone plus signs. UTF-8 BOM
helps spreadsheet imports. Money is not converted through floating-point values.
