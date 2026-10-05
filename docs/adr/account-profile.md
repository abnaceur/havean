# Account profile and identity ownership

Local preferences are display name and the English date format (en-GB/en-US). A strict versioned own-profile PATCH, idempotency key, row lock and database trigger protect changes. Audit and outbox are atomic. Contact fields cannot be submitted here. Signed OIDC callbacks synchronize provider email/verification status and actual contact-sync time without overwriting local names. Existing unknown verification remains nullable until sign-in.

Credentials, registration, recovery and verification stay in Keycloak. The trusted issuer determines the account-console link. Recovery starts the normal PKCE sign-in flow, where the provider supplies Forgot password. The account API distinguishes expired/anonymous sessions from outages. Expiry removes cached private data; conflicts require reload.

Development uses Mailpit for recovery emails and grants only own-account manage-account/view-profile roles to imported local personas. Production SMTP is never replaced by that bootstrap. Email password recovery does not imply email verification; the UI displays the actual signed claim. Provider reference (R): https://www.keycloak.org/docs/26.8.0/server_admin/ . Local profile design and fixtures are P; original account UI is V.
