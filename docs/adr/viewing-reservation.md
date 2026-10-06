# Transactional viewing reservation

Creation carries expected property/availability versions and current agent ID. The
API locks publication and rental availability, city, current eligible agent/profile/
membership, then the shared agent interval key and policy. Changes to property
status, assignment, identity state, eligibility or hours cannot race a valid write.
An active actor may request only their own new viewing. Replays use the existing
actor/request hash and return one committed booking/event.

Slots are checked in UTC against current local hours, 15-minute cadence, configured
duration, weekday, clock-change validity, unavailable intervals and actual active
appointments across properties. Requested appointments reserve capacity. Confirmation
checks actual current professional scope and viewing/property/policy versions, then
validates the same interval while excluding that request's own row.

Travel gap is a minimum separation. Persist the booked gap and require the greater
of current, retained and neighboring booked gaps. A later policy reduction does not
silently compress an existing appointment's promised travel time. The shared agent
lock serializes reservations and API policy/block writes. PostgreSQL's existing
GiST exclusion is retained as a second protection for overlapping raw intervals.
The insertion/update trigger validates current metadata and professional confirmation,
including direct application-role writes. Controlled staff fixture maintenance retains
its explicit database privilege; the API always performs the same business checks.

Owning cancellation checks the viewing version and workflow under the agent lock,
then releases capacity atomically and records a deduped receipt/event. Cancellation
works when the property has been withdrawn. Professional cancellation, rescheduling,
completion/no-show and complete property-zone calendar displays are L05.

Rows created before migration 088 retain unknown/null provenance rather than invented
historical policy versions or time zones. New bookings persist real versions and
IANA zones. Historical records must be explicitly reconciled with an eligible current
policy to be confirmed. Browser time selection submits exact server UTC instants;
it never constructs a viewing instant from the computer's default zone.
