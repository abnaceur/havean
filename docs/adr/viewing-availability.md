# Property-local viewing availability

Working hours belong to the current assigned property agent and agency. The API
locks actual membership, the property and city time zone before saving a versioned
policy. A narrow database port supplies authorized property locks without geography
update rights. Reassignment or a changed property zone invalidates the previous
public policy until it is republished for the current assignment/zone.

Public reads expose only listing/schedule versions, agent ID, IANA zone, duration,
travel gap, UTC intervals and an as-of instant. They never expose private block
reasons or organizations. A request covers at most seven local dates and returns
at most 200 slots on a 15-minute cadence. The consumer can choose one local date to
avoid truncation of a longer range. Empty availability is explicit.

PostgreSQL 17 resolves repeated autumn local times with the offset after the clock
change. The local-to-UTC round-trip rejects nonexistent spring local times. A second
check rejects intervals whose actual elapsed UTC duration differs from the configured
duration. Thus a viewing never silently crosses a clock jump with a different length.
See https://www.postgresql.org/docs/17/datetime-invalid-input.html.

Private unavailable intervals apply across the agent's properties. Active requested
and confirmed appointments remove occupied intervals. A candidate's travel gap is
the required minimum gap against an existing interval; it is not doubled. Calendar
boundaries are half-open, allowing exactly adjacent intervals when the gap is zero.
All forms and consumer choices explicitly show the property's zone. Browser/system
locale never decides the stored instant. Changing hours preserves recorded private
blocks. Cancelling a block checks its own and current policy/property versions.

L03 publishes and displays availability. L04 binds booking writes to current policy,
listing versions and transactional reservation. L05 replaces the historical account
and professional calendar actions, including their hardcoded Beijing labels.
