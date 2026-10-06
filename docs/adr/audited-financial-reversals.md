# Attributed charge and payment reversals

P09 replaces unversioned correction routes with strict native confirmations. Actual
finance membership and current property authority protect reads, mutations and
receipt replay. Fresh mutations compare original, lease, unit and grant versions,
require a retained reason and only accept original posted evidence. Original records
remain immutable. A separate exact linked entry reverses the original amount and
currency, and retains charge period/due date or payment evidence attribution.

The shared lease finance advisory lock precedes money row locks. Reversal evidence,
linked entry, allocation undo actor/time/version, audit and outbox commit together.
PostgreSQL requires attributed evidence before a runtime linked insert; a deferred
constraint rejects evidence without the exact linked entry or complete undo. Native
reason and source snapshots are immutable. Repeat confirmed requests return the
same correction; a new request cannot replace the retained reason. Revoked authority
denies even a matching cached receipt. SQL uniqueness supplies one linked entry.

A native payment reversal removes its recorded payment and restores outstanding
charges. A charge reversal removes that charge and restores available payment credit.
No funds are transferred. The retained undo list comes from the exact committed reversal event, so allocations
previously undone by another correction are not attributed to this operation.
The native form retains reason, confirmation and receipt
key after a failed acknowledgement; retained history replaces correction controls
once a linked entry exists. Historical corrections expose known recorded time and
unknown native reason/actor provenance explicitly without fabricating evidence.

SQL 131 adds the evidence and commit invariants. Additive SQL 132 makes its generic
row guard use JSON field access for charge-specific fields, so the same trigger
works on payments. Applied files remain unchanged. Another independent extension
uses a separate 131-prefixed filename; migration identity is the full immutable
filename, and the migrator applies both in lexical order. Neither schema depends
on the other extension. Screenshots are provisional local workflow evidence; no
benchmark management finance screen was observed or retrieved.

## Fresh staff authentication prerequisite

Fresh MFA realm validation exposed two reachable conditions using the same level 2
key. The pinned [Keycloak LoA utility](https://raw.githubusercontent.com/keycloak/keycloak/26.4.7/services/src/main/java/org/keycloak/authentication/authenticators/util/LoAUtil.java)
collects these level keys into a unique map; the duplicated entry failed discovery.
The optional enrolled consumer branch now uses level 1, leaving the staff branch's
required OTP and level 2 intact. A regression checks the reachable graph for unique
keys and verifies level 2 remains bound to required staff OTP. This is a prerequisite
correction discovered during P09, not a relaxation of staff enforcement.

The shared development realm was independently switched to password-only flow.
Primary authentication is therefore verified with a separate pinned Docker test
realm using imported synthetic users and the corrected MFA graph. Test-only realm
storage uses Keycloak development storage; the platform's configured PostgreSQL
identity service and the other session's realm remain untouched. Imported fixtures
stay outside the repository. The API uses the primary committed identity/core
snapshot for this verification; no foreign authentication changes are staged.
