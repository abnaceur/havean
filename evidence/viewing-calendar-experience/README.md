# Viewing calendar experience

O: Viewing request/reschedule forms used native date inputs and time dropdowns; account and professional calendar pages showed filtered lists. Agent availability used datetime inputs for private blocks.

R: User requests calendar controls throughout viewing availability and scheduling. Existing API slot, scope, time-zone and workflow rules remain authoritative.

P: Shared month calendar with previous/next month, Today, selected/range/today states, full-date accessible names, roving date focus, arrow/Home/End/PageUp/PageDown navigation and date-field Escape/focus return. Booking/rescheduling pair the calendar with selectable time slots, duration, explicit property zone/offset, selected appointment summary, loading and unavailable states. Past booking dates are disabled using the API's property-local as-of date. A date change clears the selected time; submitting remains disabled until a returned slot is selected.

Personal and professional calendars support day/month navigation and date-range calendar controls while retaining URL filters, status filters, pagination, exports and scoped actions. Calendar dots explicitly represent viewings on the current results page; they do not claim a complete month when results are paginated. Agent availability adds a calendar preview of actual bookable times, weekly controls and calendar-based unavailable date ranges with separate local-time inputs. Saved blocks and working hours refresh the preview. No private block reason enters a public response. No API, migration, dependency or business-rule changes were required.

V: Complete. Verification records (18 October 2026):

- `unit.log`: six passing cases for property dates across midnight, leap years/year boundaries, daylight-saving date arithmetic, Monday-first month grids, repeated local-hour grouping and malformed URL dates.
- `browser-initial.log`: four booking/reschedule tests passed on desktop/mobile, including concurrent reservation rejection, scoped confirmation, cancellation, reschedule conflict preservation, lost-receipt retries, outcomes, month navigation and accessibility. Two availability checks stopped at the old dropdown locator after the controls had changed.
- `browser-availability-final.log`: both corrected availability journeys pass, including real working hours/private blocks, calendar selection, keyboard arrows/Enter, date-field focus return, public slots excluding private blocks, cancellation, paused empty states, accessibility and mobile overflow at 320px.
- `browser-controls-initial.log`: supplemental checks initially matched Next.js's separate route-announcer alert. The test now scopes application errors to the main content. `browser-controls-final.log`: both final desktop/mobile checks pass for malformed-URL recovery, keyboard month navigation, date ranges, Escape/focus return, accessibility and 320px overflow.
- `types-final.log`, `lint-final.log`, `boundaries.log`, `diff-check.log`: UI/web/ops type checks, focused lint, application import boundaries and whitespace checks pass. Initial `types.log` records the resolved query placeholder inference issue; explicit response types fix it without changing runtime behavior.
- Screenshots: `availability-*`, `booking-*`, `reschedule-*`, `agenda-*`. The reschedule screenshot intentionally captures the recoverable failed-receipt state with the selected slot retained. Representative axe scans contain no serious/critical violations.

`ledger-final.log` records successful synchronized task validation. `release-final.log` confirms release still rejects the pre-existing UI-reference/device, recovery, remote-CI and unfinished engine gates.

Calendar rendering uses date-only arithmetic; all bookable instants and reservation safeguards remain in the API. No external-reference parity, physical-device verification or production-release approval is claimed. Existing release blockers and the disabled digitalization engine are unchanged.
