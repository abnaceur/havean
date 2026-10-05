# Modular monolith and ownership

The public and operations Next.js applications call a NestJS/Fastify API. PostgreSQL/PostGIS is authoritative; Meilisearch, Valkey/BullMQ and object storage are projections/integrations. Workers consume transactional outbox events. No application imports another application's internals.

Module ownership is machine-readable in modules.json. A module may read published projections of other modules; writes use the owning module's service. SQL migrations are reviewed centrally in packages/database; runtime role cannot alter schemas.

Public serializers whitelist fields. Private tables use transaction-local actor/organization scopes and row policies. Authorization combines resource ownership, current memberships, assignments and state. Browser-controlled organization IDs never establish membership.

OIDC authorization code with PKCE uses Keycloak. BFF tokens remain encrypted server-side in PostgreSQL sessions. HttpOnly SameSite cookies, origin checks, safe relative redirects and session expiration protect browser mutations. Production requires HTTPS and staff MFA.

Workers update versioned search documents, send local mail, and process approved media; every job uses a stable deduplication key. Business state and event creation commit together. Payment evidence is bookkeeping, never settlement.
