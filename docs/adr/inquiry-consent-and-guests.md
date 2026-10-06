# Inquiry consent, guest sessions and destination routing

O: SPECIFICATION §217 and L01 require guest/contact validation, persisted leads,
idempotency, anti-abuse and current public destinations.
R: the supplied API/session architecture and pinned Traefik implementation.
P: synthetic local property, agent, provider and project acceptance journeys.
V: exact benchmark inquiry geometry and private professional screens remain unverified.

The API validates normalized email, phone syntax (7–15 digits), name/message
lengths, explicit consent and current resource/type versions. New records store
consent time and policy 1; historical unknown consent remains NULL. Development
inquiries retain selected type/version/intent. Commercial inquiries retain the
existing immutable decimal offer snapshot.

A guest is an expiring database session, not an identity account. An authenticated
encrypted HttpOnly, SameSite=Lax cookie binds its ID/version and purpose. Guest
submissions have NULL user/conversation IDs. They cannot claim an existing account
by entering its email. No account/chat promise or guest confirmation email is made.
A native cookie, including an invalid one, never falls back to guest submission.
Sessions expire after 30 minutes. The database locking port returns only the
current guest's active session metadata and grants no session UPDATE authority.
Administrative maintenance uses the migration owner, not guest privileges.

An atomic PostgreSQL admission window lasts 600 seconds: guest session and contact
limits 5; native actor/contact limits 30; guest address and session-creation limits
60. HMAC fingerprints keep raw client addresses/contact emails out of counter
records. Failed transactions roll back admission increments. Limits persist across
API restarts. Idempotent replays precede admission/destination checks and return the
original committed receipt without producing new leads or notifications. Different
payloads with the same key conflict. Guest keys use a separate session-scoped table;
native keys retain account-scoped idempotency. Cookie rotation cannot bypass contact
or address admission. Contact syntax validation does not prove contact ownership.

The server BFF signs gateway client-address, origin, method, path and timestamp.
API verification rejects tampering/stale context. User-supplied context headers are
not forwarded. The development API/BFF ports are internal; the only incoming route
is the pinned gateway. Traefik's default middleware removes untrusted forwarded
headers and constructs X-Real-Ip from the actual remote address:
[Traefik 3.6.1 source](https://raw.githubusercontent.com/traefik/traefik/v3.6.1/pkg/middlewares/forwardedheaders/forwarded_header.go).
Deployments must retain this boundary; do not enable insecure forwarded headers or
expose the BFF directly while relying on this address admission policy.

Listing contacts route to the currently eligible assigned agent. Without one,
they become unassigned agency leads and notify a real active manager. Direct-agent
contacts require the current public profile and city. Approved providers route to
the vendor organization; published projects route to the developer organization.
No active receiving team means a visible rejection. A separate `inquiry.routed`
outbox event drives the atomic team inbox notification, keeping it distinct from
the native consumer's `inquiry.submitted` confirmation event. No email delivery
claim is made for a team inbox event. Private contact/message text is absent from
event payloads and notification copy.

The shared form validates before sending and retains a stable key per actor and
payload across network failures, including reopening the form. Browser session
storage contains only the payload digest and UUID key. After a successful guest
submission it displays the actual saved lead ID. Native submissions retain their
exact conversation link. Errors never show a saved receipt.

Migrations 082–084 are append-only. 083 preserves the native restrictive destination
policy while adding guest eligibility; 084 resolves the PostgreSQL row-lock
requirement without broadening guest updates. A historical development test cleanup
now deletes dependent leads before conversations, following the exact-thread FK
added in B04. Production constraints were retained.
