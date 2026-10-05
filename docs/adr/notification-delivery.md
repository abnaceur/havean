# Notification delivery and consent

P: The API owns optional preferences, matching, scheduling, eligibility, retries and provider receipts. Workers schedule signed service requests; consumer clients use their server session. Optional email and in-app channels default off. Email opt-in requires an active profile with a verified email synchronized from signed identity claims.

P: Digests group newly published eligible matches per saved search and UTC calendar day, or Monday-based UTC week. They are due at the next period boundary. A unique search/listing item and source-event marker prevent repeat alerts. A frozen/terminal period uses a subsequent slot rather than changing a sent batch. Delivery rechecks current search version/pause/deletion, market/currency, profile, consent and public listing version. Changing search criteria invalidates its earlier queued digest. No historical inventory is backfilled on opt-in.

P: A durable frozen payload and attempt/version precede SMTP. Processing has a 30-second lease; failures use exponential backoff and stop after five attempts. Account retries permit only a versioned own failed-to-queued transition through a restricted database function. The frozen message identity stays stable. The next attempt checks provider acceptance before sending. A user advisory lock serializes opt-out with new sending; once an opt-out request completes, no later optional send starts. Receipt reconciliation can record a previously accepted email after opt-out without sending again.

P: Account states distinguish scheduled, checking acceptance, provider accepted, in-app, acceptance unconfirmed/retry pending and cancelled. Provider acceptance does not establish inbox delivery or reading. Read state is separately versioned. Recipient addresses and frozen mail payloads are never exposed in delivery summaries. Necessary inquiry confirmations do not depend on optional consent.

## Providers

R: [BullMQ idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs) explains why retries must preserve final state. [Mailpit API](https://mailpit.axllent.org/docs/api-v1/) exposes stored-message searches. [Nodemailer SMTP](https://nodemailer.com/smtp) documents the SMTP transport and accepted recipient response.

P: Development uses pinned Mailpit over the private Docker network and stable Message-ID receipt lookup. Production requires `MAIL_PROVIDER_URL` (HTTPS), `MAIL_PROVIDER_KEY`, and a real `MAIL_FROM`; it never falls back to development SMTP. The required provider adapter contract is:

- `POST /messages`: bearer authorization, `Idempotency-Key` equal to the stable message ID, JSON `{messageId,to,from,subject,text}`. Retries must return the same acceptance without another send.
- `GET /messages/{encoded-messageId}`: bearer authorization; 404 only when definitely not accepted, otherwise JSON `{status:"accepted",messageId:"provider-reference"}`. Outages or uncertain responses must fail rather than report absent.
- Both accepted responses must represent actual provider acceptance. API errors are treated as unconfirmed, never delivered. Production inquiry confirmations use the same adapter and persist a receipt.

P: Internal service calls use a purpose-derived HMAC, canonical JSON body digest, exact method/path, and timestamp valid for 60 seconds. Version/state checks and durable deduplication protect replay. OpenAPI documents service signatures separately from consumer session cookies.

V: No live production provider, inbox delivery, natural overnight cadence, original-site notification parity or launch verification is claimed. Isolated tests advance digest due dates and processing leases; verified fixture profiles represent identity claims rather than exercising verification mail. Original approved visual baselines remain unchanged.
