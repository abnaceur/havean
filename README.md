# Haven real estate platform

English Beijing marketplace and professional workspace built from `SPECIFICATION.html`. This is a working local development build. The specification has 120 acceptance tasks; release readiness is tracked honestly in `TASKS.json` and `PROGRESS.md`.

## Start with Docker

Requirements: Docker Engine with Compose v2+, about 6 GB available memory, and free local ports 8088–8091. No host Node installation is required.

```sh
./dev.sh
```

The script generates unique local credentials, imports a Keycloak realm, installs frozen dependencies, applies reviewed migrations, seeds synthetic inventory once, and waits for healthy services. It selects Docker's default builder explicitly to avoid inheriting an unrelated workspace's builder. Containers watch source files for development reloads.

- Consumer: http://localhost:8088/bj
- Professional workspace: http://localhost:8089/ops
- Identity: http://localhost:8090
- Local email inbox: http://localhost:8091
- OpenAPI JSON: http://localhost:8088/api/v1/openapi.json

Generated development accounts and their password are in **`infra/generated/personas.md`**. Personas: `buyer`, `owner`, `agent`, `manager`, `tenant`, `developer`, `vendor`, `moderator`, `support`, `admin`, and `outsider`. Staff personas use TOTP; local setup instructions are in that file. These files and all generated environment files are excluded from source control and Docker build contexts. Never reuse these demo accounts in production.

PostgreSQL, Valkey, Meilisearch and S3 infrastructure do not expose host ports. All published ports bind only to loopback. Named volumes preserve business data, identity, objects, search and queues. Secrets are generated once and retained on subsequent starts; do not change database passwords without rotating the corresponding database roles.

```sh
docker compose logs -f api worker
docker compose stop
docker compose up -d --no-build --wait
docker compose run --rm migrate
```

Seeding is idempotent and preserves edits. `docker compose down` preserves named volumes; deleting volumes deletes local data.

## Implemented local flows

- Resale, rentals and commercial discovery, URL filters/sort, details, gallery, community and agent profiles.
- New-development and renovation directories, details and inquiries/quote requests.
- Real OIDC sign-in, encrypted server sessions, favorites, saved searches, inquiries, persistent conversation messages and viewing requests.
- Owner requests, private drafts, decoded photos, private PDF evidence and moderator publication/revisions.
- Listing and development short videos, real floor-plan drawings, lazy-loaded 360° panorama scenes with linked hotspots, rights review and byte-range video streaming.
- Agency leads, viewings, moderation, support replies, account suspension and immutable audit history.
- Management lease drafts/activation/renewal/ending, recurring charges, recorded payments, locked allocations, charge/payment reversals, deposit movements and reconciled statements.
- Tenant lease/balance portal, maintenance requests and manager updates with private-note exclusion.
- Decimal mortgage estimates, both repayment methods and CSV schedules.

Photos illustrate synthetic inventory and are not depictions of the seeded Beijing properties. Sources and rights are in `packages/test-support/assets/provenance.json`.

CI: run `./ci.sh` for all required gates on a clean isolated stack. Sanitized reports are retained locally and uploaded to the private local S3 artifact adapter with checksum readback; the GitHub workflow additionally retains reports/screenshots when a repository is configured.

## Checks

Run within the installed Docker workspace:

```sh
docker compose exec api pnpm lint
docker compose exec api pnpm typecheck
docker compose exec api pnpm build
docker compose exec api pnpm test:unit
docker compose exec api pnpm task:validate
docker compose exec api pnpm license:check
```

Run unit, database integration and both desktop/mobile browser journeys entirely in Docker:

```sh
./test.sh
```

`./test.sh` creates and resets the separate `haven-integration` Compose project. For a targeted check, pass a command, for example `./test.sh pnpm exec playwright test --project=mobile`.

The test image installs a pinned Chromium headless renderer and its OS dependencies. It shares the isolated test proxy's network namespace so OIDC uses consistent localhost issuer and callback URLs. The test stack publishes no host ports and has separate database, identity, search, object, email and queue volumes. Each run resets only those test volumes and checks a deterministic seed fingerprint; development volumes are preserved. Do not run simultaneous test suites against the same isolated project.

For host execution, install Node 24.21 and pnpm 10.32.1, then:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install --only-shell chromium
pnpm test:integration
pnpm exec playwright test --project=desktop
pnpm exec playwright test --project=mobile
```

Browser tests use real Keycloak, API, database and storage. Test traces can contain development credentials and are ignored. Approved visual baselines are not generated automatically. The user approved 33 local English baselines; additional screenshots are evidence only; `docs/reference/screens.json` retains unresolved reference states.

`pnpm check:release` deliberately fails while any mandatory task or evidence is unfinished. See `BLOCKERS.md` for external reference and launch inputs, and `PROGRESS.md` for implementation gaps. The development Compose file is not a production deployment.

Account alerts are available at `/account/notifications`. Optional email and in-app alerts start off; saved-search cadence uses UTC calendar boundaries. Local email is captured by Mailpit at `http://localhost:8091`. Production requires a real sender and an HTTPS idempotent mail provider; see [notification delivery](docs/adr/notification-delivery.md) for configuration and receipt semantics.

For approved English pixel regression on clean synthetic data, use `./test.sh pnpm test:visual`. CI runs visual comparisons before browser mutations, then desktop/mobile business journeys. Baselines are hash checked, pinned to the declared renderer and never automatically refreshed.

Viewing calendars are available at `/account/viewings` and `/ops/viewings`. Confirmation schedules a necessary reminder 24 hours before the viewing (immediately when confirmed within that window). Cancelled or rescheduled bookings invalidate pending reminder jobs. Inquiry and viewing workspaces offer scoped, formula-safe CSV downloads; see [reminders and reports](docs/adr/viewing-reminders-and-exports.md).

Conversation participants and inquiry context are shown at `/account/messages` and `/ops/messages`. Current assignment/membership controls every read and authenticated socket subscription; see [conversation authorization](docs/adr/conversation-authorization.md).

Messages commit before acknowledgement, retain drafts for receipt retries and share scanned files only with current participants; see [durable private messages](docs/adr/durable-private-messages.md).

Inbox selection survives refresh, unread counts use own committed read cursors, and older messages remain accessible; see [conversation read state](docs/adr/conversation-read-state.md).
