# Renovation request recipient and history

Services owns `quotes` and immutable `quote_activity`. Consumer web and professional
ops use the existing HttpOnly session BFF. Contact consent and city/provider/service
versions are validated in the API, with exact current destination locks supplied
by `quote_destination`. That bounded service port locks the actual vendor profile,
active membership, provider and current city, returning only the publication snapshot
and delivery scope. Geography remains owner of city configuration; services reads
currency rather than treating consumer language as currency.

A native request records the selected provider version, public name/service/area
snapshot, exact current recipient and organization, validated contact details, consent
policy/time and optional NUMERIC budget. Legacy records retain unknown assignment,
contact, currency and consent rather than being backfilled. Actual current recipient
membership or actual administrator membership is required for professional access;
another vendor in the same organization is denied. Customer ownership preserves
personal history after publication or vendor access ends.

Create and status changes use canonical strict contracts, optimistic versions and
stable idempotency receipts, including a retained key after a lost acknowledgement.
History, audit and outbox writes commit in the same transaction. History notes are
explicitly shared with the customer; there is no private internal-note field here.
Requested/assigned/contacted/quoted/closed are nonbinding tracking states. Recording
contact requires an explicit professional update; the system does not claim a call
or quote was delivered merely because a request exists. No funds or contract are
created. In-app lists are verified routing; external vendor email delivery is not
claimed.

Applied migrations are immutable. SQL 103 moves the city lock into the bounded
security-definer destination port after the first integration run exposed SELECT
FOR SHARE's additional update-policy requirement. SQL 104 lets an owning customer
read INSERT RETURNING's new row directly, before a stable table-lookup function can
observe that row. Neither correction invents historical data or loosens vendor scope.
