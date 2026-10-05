# Development and recovery

Run ./dev.sh from the repository root. The full stack is managed by compose.yaml. Secrets and imported fixtures are generated under .env and infra/generated. Named volumes preserve data through container replacement.

If a service fails, use docker compose logs SERVICE and docker compose ps. Do not reset volumes to resolve migration errors. Migrations are serialized with a PostgreSQL advisory lock and journaled. Fix forward using a new migration. After migration fixes run docker compose run --rm migrate.

Only proxy ports bind localhost. Worker readiness and projection state are separate from authoritative API data. Search projection failures must not hide published database listings. The current discovery implementation declares its SQL searchMode explicitly.

Development photography is illustrative and license provenance is stored with fixtures. Do not import benchmark people, listings or private APIs.

## Isolated checks

Run `./test.sh` for a fresh integration project with its own volumes and no published ports. Target a suite with `./test.sh pnpm test:integration`. The reset removes only `haven-integration` volumes; do not replace it with a development `docker compose down --volumes`. Environment and Keycloak imports live in `.env.integration` and `infra/generated/integration`, both ignored and excluded from Docker contexts. Pre-test fixture hashes are recorded in `evidence/latest-fixture-fingerprint.json`.

## Continuous integration

`./ci.sh` resets the same isolated Docker project and enforces frozen installation, fixture/contract generation checks, lint, type checking, unit/integration/browser tests and builds. Every failed command terminates the gate. Reports under `evidence/ci` are scrubbed of generated credentials. The GitHub workflow retains reports and screenshots even after failure; credential-bearing browser traces are excluded. Baselines are never updated by the gate. Checkout and artifact actions use verified release commit hashes. Require the `verify` job before merging; `pnpm check:release` remains the separate all-task completion gate.
