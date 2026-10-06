# Conversation context and current participant grants

Native inquiries persist their exact conversation/lead link before committing the
receipt. Lead linkage populates source-owned resource type/version and members:
customer, current assigned agent, and actual active professional team roles. Current
profile/membership/organization checks apply on every conversation read and socket
subscription; broader supplied role labels do not grant participant access.

Lead reassignment refreshes persisted grants within the same transaction. The former
agent loses access immediately, while the customer retains the discussion. Explicit
historical rows preserve their recorded customer/agent relation with historical
provenance and unknown resource type; they are read-only. Native orphan inserts do
not acquire participant grants from a guessed ID. Member inserts are service-only;
normal mutations cannot change source-owned conversation facts or impersonate a
message sender. The assignment API no longer separately updates conversation facts:
the exact linked lead trigger owns that transfer.

Native inboxes display the resource category and recorded participant names. Existing
inbox polling remains; message deduplication, read cursors and live replay are M02–M04.

## Authenticated socket room boundary

The pinned MIT `@fastify/websocket` 11.3.3 plugin runs authorization before upgrading
connections, following its [official hook documentation](https://github.com/fastify/fastify-websocket).
The gateway routes `/api/v1/realtime/conversations/:id` to the API. Browser HttpOnly
server-session cookies remain the credential; no token is exposed in a URL or app
state. Only configured application origins are allowed. Optional organizationId is
validated against actual session memberships, then used for resource scope.

The URL denotes the single authorized conversation. A strict subscribe command can
only address that same ID. Every command revalidates the session and current grant;
invalid/revoked access closes with 1008. Synchronous handler attachment prevents lost
initial frames. Payloads are capped at 8 KiB and compression is disabled. This stage
establishes the room boundary; message replay/broadcast is implemented in M04.

## Local migration correction

Mutation guards and the pending-row INSERT RETURNING correction belong to additive
migration 094, leaving 093's first-applied definition restored. The provisional
integration stack had already seen the guards; 094 uses replacement definitions to
reconcile both stacks. The 094 correction changes policies/functions only. Initial integration
fixture cleanup hit retained assignment history; fixtures are now closed/archived
without deleting that history. The earlier synthetic rows were closed and their
memberships archived through explicit fixture maintenance.
