# Verified selection, 4 October 2026

| Component | Selection | Requirement / license |
|---|---|---|
| Node | 24.21.0 LTS | Next >=20.9, Nest >=20.19; Node 20 is not selected |
| pnpm | 10.32.1 | Frozen lockfile; MIT |
| Next | 16.3.8 | React 19.3.0; MIT |
| Nest | 12.1.2 | ESM, explicit dependency injection; MIT |
| TypeScript | 6.0.2 | Satisfies Nest Swagger and typescript-eslint peer ranges; Apache-2.0 |
| PostgreSQL/PostGIS | 17 / 3.5 | PostgreSQL license / GPL-2.0-or-later |
| Keycloak | 26.4.7 | OIDC PKCE, Apache-2.0 |
| BullMQ / Valkey | 6.3.11 / 8.1.6 | MIT / BSD-3-Clause; actual queue compatibility requires integration test |
| Meilisearch CE | 1.37.0 | MIT; only public projections |
| SeaweedFS | 4.46 | Apache-2.0; replaces unavailable MinIO image |
| Traefik | 3.6.1 | MIT; file configuration, no Docker socket |
| Mailpit | 1.27.8 | MIT; development only |

Exact npm package versions and SPDX licenses are in dependencies.json; exact service image digests are in images.json and compose.yaml. Container availability was checked by registry manifests and actual pulls. No floating service tags are used.

Official requirements: https://nextjs.org/docs/app/getting-started/installation, https://docs.nestjs.com/migration-guide, https://nodejs.org/en/about/previous-releases. Provider evidence: https://www.keycloak.org/server/containers, https://docs.bullmq.io/guide/connections, https://github.com/seaweedfs/seaweedfs.

TypeScript 7 was the registry default but rejected because Swagger and eslint peers require 6.0 or earlier. Pinned versions are reviewed for reproducibility; this document does not certify absence of vulnerabilities. Dependency audit evidence is tracked separately.
