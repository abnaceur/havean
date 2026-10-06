# Scoped property-zone viewing calendars

The consumer calendar is strictly personal. The agency calendar checks actual
organization membership and the booked agent assignment; agency managers can also
manage their team's appointments. A booked assignment remains readable/cancellable
within that agency after the property's current agent changes. Confirmation or
rescheduling still requires the current eligible property agent to match the booking.

A narrow database read port preserves personal booking records after withdrawal.
Consumers then receive an unavailable-property label instead of newly private facts.
New bookings render their recorded IANA zone; older unknown zones use the current
property zone with an explicit qualification. Date filters compare property-local
dates, not UTC dates. Pages contain at most 50 records plus a real has-more flag.
Ordering is current source start/id order; it does not claim a frozen snapshot.

Rescheduling keeps the same booking ID. The API checks scope/current resource and
viewing versions under the shared agent lock, excludes that booking's own interval,
then updates its start/end and metadata in one transaction. A conflict, invalid/past
time, state or stale version leaves the original interval/status/version untouched.
Consumer changes return to requested status for fresh professional confirmation;
professional changes retain the existing requested/confirmed state. Retained travel
gaps survive changes. Ended bookings cannot be moved through either API or direct
application database updates.

The property has its own GiST exclusion in addition to the agent exclusion. This
preserves its occupied interval when agents change, even across distinct agent IDs.
Migration 090 adds that constraint without cancelling or rewriting old reservations;
pre-existing conflicting rows would make migration fail explicitly. Both databases
applied it successfully. Public/reschedule slots use the same property-capacity check.

Owning and professional cancellation release capacity atomically. Completion and
no-show require professional appointment scope, confirmed state and an ended actual
UTC interval; then they are terminal. Native calendar actions retain request keys and
reschedule drafts after lost responses. Filters persist in the URL. API errors do
not become empty-result claims. Product labels are English; internal version numbers
remain in the API rather than the calendar copy.

Synthetic ended appointments in tests are explicit fixtures to exercise outcomes;
the reports do not claim that test participants waited through multi-day appointments.
Reminder scheduling, invalidation and scoped CSV exports remain L06.
