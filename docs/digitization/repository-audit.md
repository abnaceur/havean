# HE-A01 repository audit — 6 October 2026

Inspected baseline and checked-out HEAD both equal
`4c5b9f976f9df197ea65dafdbcd453bceda03f56`. There are no committed head differences.
The worktree is not a clean inspected snapshot: pre-existing management work modifies
API registration/controller, inventory authority, contracts/generator and module
ownership. Untracked SQL 106-management-grant-authority.sql and
107-management-owner-admission-lock.sql already reserve those numbers. Engine SQL
must recheck the maximum (at least 108 next), never overwrite these migrations.
Further worktree changes appeared during inspection; do not reset or replace them.
The root specification, root JSON task ledger and its generated Markdown have no
diff against HEAD. 120 tasks remain, 88 done; P01 is an unrelated in-progress task.

## Required documents and boundaries

AGENTS.md, SPECIFICATION.html, CODEX_START.md, TASKS.json and PROGRESS.md inspected.
The modular-monolith architecture, decimal-string money, version/scope/state checks,
O/R/P/V evidence and independent publication remain authoritative. CODEX_START's
marketplace resume suggestion does not supersede this engine request.

| Integration | Actual source | Finding |
| --- | --- | --- |
| Registration/API envelope | apps/api/src/main.ts; apps/api/src/platform/core.ts | Identity.actor, data/fail, transaction/idempotent |
| Inventory authority | apps/api/src/inventory/rich-media.ts; controller.ts; moderation-evidence.ts | Extract checked access; explicit reviewer grant, no agency deed access |
| Owner evidence | inventory/media.ts; docs/adr/owner-private-evidence.md | PDF private originals, owner/current temporary reviewer only |
| Upload/content | inventory/media.ts; scanner.ts; video.ts | Small uploads buffered; scan/Sharp/transcode inside transaction; capture path must differ |
| Object store | compose.yaml; inventory/media.ts | SeaweedFS 4.46 pinned; private S3 bucket, no host infrastructure port |
| Worker | apps/worker/src/main.ts; processor.ts | Outbox BullMQ queue, Valkey connection, recovery relay; generic processor unconditionally acknowledges unfamiliar events |
| Durable outbox | packages/database/src/index.ts; migrations/001-initial.sql | Actor transaction/event port; reuse outbox and outbox_effects |
| Scope | migrations/020-moderation-evidence-grants.sql, 063-owner-grant-lock.sql, 075-agency-memberships.sql, 079-agency-assignments.sql | Current-grant/membership/assignment checks required; workerActor admin cannot be engine authority |
| Rich media review | inventory/rich-media.ts | Media upload approval differs from independent listing_media approval; pending metadata retained |
| Legacy geometry | packages/contracts/src/property-media.ts | Convex normalized room, required sceneId, 2.7 default, supplied floor dimensions |
| Legacy playback | apps/web/src/property-media.tsx, tour-plan.tsx, tour-model.tsx, spatial-model.ts | Y-up illustrative hand-built extrusion, lazy viewers; new canonical Z-up adapter required |
| Authoring | packages/ui/src/spatial-media-editor.tsx, media-studio.tsx | Existing bounds editor, no structural topology editor |
| Sessions/BFF | apps/ops/src/app/api/v1/[...path]/route.ts | Buffered body, route-specific future SSE/multipart needed |
| Contracts | scripts/generate-contracts.mjs; scripts/generate-openapi.ts; packages/contracts/src/index.ts | Generated operations/models/client/OpenAPI, current user work preserved |
| Tasks | scripts/tasks.mjs; scripts/ci-check.sh | 120 original rows; additive engine validator, release gate and existing CI task gate |
| Licenses | scripts/licenses.mjs; docs/adr/dependencies.json, images.json | npm package pins and image digests; Python/models/CUDA not covered yet |

## Checked regression commands

These files exist and implement actual assertions; no new regression success is
claimed merely from their presence:

```sh
./test.sh pnpm exec vitest run tests/integration/approved-tours.test.ts tests/integration/outbox.test.ts
./test.sh pnpm exec playwright test tests/e2e/rich-media.spec.ts tests/e2e/spatial-tour.spec.ts --project=desktop --project=mobile
docker compose exec -T api pnpm exec vitest run tests/unit/spatial-media.test.ts
```

approved-tours verifies scan/decoder/publication predicates and absence of storage
URLs. outbox has real BullMQ worker SIGKILL/replay and withdrawn-search checks.
rich-media/spatial-tour use desktop/mobile authenticated author/reviewer flows,
actual uploads, publication, linking and model rendering.
Read test.sh/ci.sh/scripts/ci-check.sh: test.sh resets haven-integration volumes,
prepares separate .env/config, builds pinned Docker tests and starts real services;
it does not reset development. Suites must not overlap on that project. Full CI
includes frozen install, task/fixture/contracts/reference/license/lint/types,
unit/integration/browser/production build and immutable visual checks.

## Environment observations

Development Compose DB/Valkey/storage/scanner/search/identity were healthy at
initial inspection; API was unhealthy because pre-existing management/grants.ts
had a transform syntax error (quoted JSON SQL expression). Management files were
being edited during this session. Do not claim a clean startup or alter unrelated
work to fabricate a green gate. Document eventual current-state outcomes separately.
GPU hardware, headset, country holdout examples and licensed real reconstruction
fixtures have not been established. No hardware/performance/accuracy measurements
or parity approval are inferred.

O: no new original reference capture. R: supplied engine and inspected repository.
P: actual local checkout/Compose inspection. V: new screens, full R1–R4 and production
remain unverified.

## Subsequent head differences

Concurrent marketplace work committed P01/P02/P03 while this engine session ran;
HEAD observed 5c00e295125c819eab20a9454efadcc31591f12a, with P04 changes and SQL
116 present. Recheck again before assigning engine migration numbers; 106 is no
longer available. Original marketplace ledger and platform specification were not
repurposed by engine work. Stable snapshot validation and failed full-CI gates are
recorded under evidence/digitization/validation/2026-10-06.md, not asserted as
live-head release or parity approval.
