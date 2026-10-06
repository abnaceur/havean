# Immutable HTTPS deployment

This runbook implements Q08 staging packaging. A successful local drill is P evidence, not approval of a public deployment, original-site parity or external mail delivery. Run the mandatory task/release validator before launch.

## Images and configuration

Build from the intended clean Git revision with Docker BuildKit. The Dockerfile pins Node and pnpm, builds native JavaScript and Next standalone servers, and removes npm from final images. Run each target and record its image SHA-256 ID; registry deployments require repository digests for images published to the chosen registry.

```sh
docker build -f infra/Dockerfile.production --target api -t haven-api:staging .
docker build -f infra/Dockerfile.production --target worker -t haven-worker:staging .
docker build -f infra/Dockerfile.production --target migrate -t haven-migrate:staging .
docker build -f infra/Dockerfile.production --target web -t haven-web:staging .
docker build -f infra/Dockerfile.production --target ops -t haven-ops:staging .
```

Set the five HAVEN_*_IMAGE fields to immutable digests, not these convenience build tags. Keep application secrets in a protected APP_ENV_FILE. Keep migration/identity administrator credentials outside that file. `scripts/production-preflight.mjs` checks deployment inputs and file permissions without logging values; native application configuration additionally checks HTTPS, mail, maps and required secrets. Generate proxy routes with `scripts/production-routes.mjs` using distinct web, operations and identity HTTPS origins. Public identity routes expose realm login/resources; administrative routes remain private.

Compose publishes only the HTTPS gateway. Database/cache/search/object administration and scanner ports remain private. Application containers run as node with read-only filesystems, bounded writable temporary/cache paths, capability restrictions and resource limits. PostgreSQL has a protected WAL archive volume; this is a local archive, not off-host backup evidence.

Start infrastructure and migrate using separate credentials before application boot:

```sh
docker compose --env-file /protected/compose.env -f compose.production.yaml up -d db cache search storage scanner identity
docker compose --env-file /protected/compose.env -f compose.production.yaml --profile maintenance run --rm migrate
docker compose --env-file /protected/compose.env -f compose.production.yaml up -d api worker web ops proxy
```

The migration image can run `node scripts/schema-preflight.mjs` against the deployed database. Review schemas before changing images; a previous image does not reverse schema changes.

## Explicit synthetic local staging

On a clean checkout, `HAVEN_SYNTHETIC_STAGING=true node scripts/staging-setup.mjs /absolute/private/unused-directory` generates protected local fixture credentials, a private seven-day CA, TLS routes and strict staff MFA realm import. Populate generated compose.env with the actual five built image IDs. Keep all generated files outside Git. The application environment excludes development persona and administrator credentials.

For local staging only, add `-f compose.staging-local.yaml` to each Compose command. It adds trust for the generated CA, private Mailpit and an authenticated HTTPS mail adapter whose acceptance depends on actual SMTP delivery. Its sender and identities are synthetic; this does not verify production email providers. After migration, seed only this new synthetic staging database with the migrate image command `node packages/database/dist/seed.js`. Existing databases retain their records. Rebuild search with the operator worker entry point and verify eligible document counts.

Resolve web.haven.test, ops.haven.test and identity.haven.test to the local gateway during tests. `curl --cacert /protected/ca.pem --resolve web.haven.test:8443:127.0.0.1 https://web.haven.test:8443/bj` verifies actual TLS. Trust the CA only for this staging test. Test an inquiry, sign-in/MFA, private upload and staff scope through HTTPS, then scan the owned gateway externally and verify private services publish no ports. Remove a required secret in a separate probe container and verify boot refuses it.

Public launch still needs authorized domains/certificates, actual provider/sender configuration, inventory rights, off-host recovery, completed mandatory tasks and recorded release gates. The user's current authorization is to push main; no external deployment is inferred.

The concrete native search operator is `docker compose --env-file /protected/compose.env -f compose.production.yaml run --rm worker node apps/worker/dist/apps/worker/src/operator.js search-rebuild`. Its report must show `status: swapped` and equal source/verified counts. A changing source correctly refuses a rebuild; retry after the source is stable.
