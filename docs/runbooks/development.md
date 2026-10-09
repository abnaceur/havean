# Development and recovery

Run ./dev.sh from the repository root. The full stack is managed by compose.yaml. Secrets and imported fixtures are generated under .env and infra/generated. Named volumes preserve data through container replacement.

If a service fails, use docker compose logs SERVICE and docker compose ps. Do not reset volumes to resolve migration errors. Migrations are serialized with a PostgreSQL advisory lock and journaled. Fix forward using a new migration. After migration fixes run docker compose run --rm migrate.

Only proxy ports bind localhost. Worker readiness and projection state are separate from authoritative API data. Search projection failures must not hide published database listings. The current discovery implementation declares its SQL searchMode explicitly.

Development photography is illustrative and license provenance is stored with fixtures. Do not import benchmark people, listings or private APIs.

## Isolated checks

Run `./test.sh` for a fresh integration project with its own volumes and no published ports. Target a suite with `./test.sh pnpm test:integration`. The reset removes only `haven-integration` volumes; do not replace it with a development `docker compose down --volumes`. Environment and Keycloak imports live in `.env.integration` and `infra/generated/integration`, both ignored and excluded from Docker contexts. Pre-test fixture hashes are recorded in `evidence/latest-fixture-fingerprint.json`.

## Continuous integration

`./ci.sh` resets the same isolated Docker project and enforces frozen installation, fixture/contract generation checks, lint, type checking, unit/integration/browser tests and builds. Every failed command terminates the gate. Reports under `evidence/ci` are scrubbed of generated credentials. The GitHub workflow retains reports and screenshots even after failure; credential-bearing browser traces are excluded. Baselines are never updated by the gate. Checkout and artifact actions use verified release commit hashes. Require the `verify` job before merging; `pnpm check:release` remains the separate all-task completion gate.

## Shared-host file watching and maintained infrastructure

If Next startup reports an exhausted inotify quota, add `-f compose.polling.yaml` to development Compose commands; this uses webpack polling without changing host sysctls. Keep the same environment/project flags for every command.

Compose builds the maintained database, identity and scanner images from pinned Dockerfile sources. Fresh database initialization applies extension-owner geometry hardening before runtime admission. Existing clusters require administrator preflight in `docs/runbooks/production-readiness.md`; migration 165 refuses unsafe decoder permissions. A PostgreSQL libc/image transition requires a new cluster and logical restore with financial/identity/media reconciliation. Never reset a live development volume to fix an upgrade.

With the shared-host polling override, Traefik reads its static route file without a file watcher. Restart the proxy after editing routes. This avoids an exhausted inotify quota returning 404 while ping is healthy; verify an actual application route as well as container health.
