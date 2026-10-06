# Verified tenant account linking

P02 invitations bind a current management organization/property grant and version,
recipient email, proposed tenant name and seven-day expiry. They do not create a
lease or grant organization staff membership. Managers cannot post arbitrary user
IDs into tenant records. Only the exact active account with the matching verified
email can accept or decline. Acceptance requires explicit consent in the API/UI,
current source/manager authority, current invitation version and pending state.

The bounded PostgreSQL acceptance port locks the recipient, invitation, property
grant, owner source and inviting manager membership. An account/organization lock
reuses an existing tenant record or inserts one, with durable idempotent receipts,
activity/audit/outbox committed before acknowledgement. Manager cancellation has
its own current authority/version/state checks. Tenant identity writes require this
port; retained history cannot be rewritten through the application role.

Management owns invitation/link facts and tenant profiles. Inventory remains the
canonical unit source. A narrow invitation context port exposes only the community
label to its verified recipient, including for a property without a public listing.
It exposes no occupied address, ownership evidence or other account's profile.
Current team access to private tenant records requires a valid linked property
grant or a valid grant for an existing lease; personal reads use exact user IDs and
whitelisted fields. Historical recipient invitations remain readable after grant
revocation, while acceptance is denied. Privacy export includes own invitations.

Invitations are delivered through the verified account's in-app inbox. The interface
makes that channel explicit; no external email delivery is claimed. Native creation
and acceptance retain inputs and receipt keys after lost responses. Existing seed
links are retained as supplied historical records without invented acceptance events.
