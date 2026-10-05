# Production readiness

The local Compose file is development-only. A production release requires the remaining Q tasks and provider checks; check:release must pass before signoff.

Configure actual domains, HTTPS, separate identity/storage/search secrets, production OIDC registration and recovery mail, staff OTP/WebAuthn policies, licensed map/geocoder providers, malware scanning, mail/SMS delivery and production inventory rights. Replace demo realms/personas and remove synthetic inventory explicitly through a reviewed importer.

Use immutable application image digests, separate migration and runtime credentials, private infrastructure networks and TLS at the reverse proxy. Do not use Keycloak start-dev in production. Set secure cookie behavior, staff MFA claim mapping and trusted origins. Scope provider credentials to individual buckets, and sign private downloads with short expirations.

Before launch: source financial reconciliation, cross-organization denial tests, complete reference/accessibility review, actual capacity measurements, dependency/container security scans, isolated restore rehearsal, identity/object backup verification, RPO/RTO measurement and schema-compatible rollback rehearsal. A previous application image does not undo a schema migration.

The API denies staff actions in production unless the verified access token's `acr` is at least 2. Configure the Keycloak browser flow to require OTP or WebAuthn for staff and map that flow to level 2; never map password-only authentication to that level. The operations login requests `acr_values=2`. Development realms use generated password personas only. Production boot rejects HTTP origins and `DEV_PASSWORD`.
