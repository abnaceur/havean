# Private example workspace access — 12 October 2026

## O
User reported repeated “Digitization workspace not found” errors while signed in as Admin Demo. Retained authored OCR intake33462e6e-feca-4d62-afdc-bf1e6fe0f717 is active and owned by Agent Demo. Database `digitization_actor_target` restricts private intakes to their creator even when another same-agency account has administrative roles. No public digitization package exists in the development database.

## R
Preserve scoped private access and server-session API authorization. Explain unavailable workspace access clearly and provide a usable path to the existing example. Do not publish, change owner grants or manufacture a reconstructed scene to make the example appear available.

## P
`apps/ops/src/digitization-plan-editor.tsx` now checks workspace access before mounting source/model/plan/review panels. While checking it shows loading; a403/404 yields one neutral account-access message with retry and a link to the current user's drafts. Other request failures retain a retryable error. Authorized users receive the existing panels. A keyed workspace boundary and effect cleanup discard stale lookups after navigation.

One actual desktop browser journey (`workspace-access-example-corrected-functional.log`) verifies Admin Demo sees only the access message, dependent private panel requests are absent, and Agent Demo can select the pending unitArea fact, see123.45 m2 with its original crop, and fetch the private preview with HTTP200. Screenshot: `example-agent-document-results.png`. The initial check omitted selection of the source-fact dropdown; its failed expectation is retained in `workspace-access-example-functional.log`, and the corrected check explicitly selects the fact. Current ops types and focused lint pass in `workspace-access-ops-types.log` and `workspace-access-focused-lint.log`.

Command: `docker compose --profile tests run --rm --no-deps -e DIGITIZATION_EXAMPLE_WORKSPACE=33462e6e-feca-4d62-afdc-bf1e6fe0f717 tests pnpm exec playwright test tests/e2e/digitization-workspace-access.spec.ts --project=desktop`.

## V
Synthetic local source only, no factual property measurement or public listing. No source decisions, grants, ownership or publications changed. No task acceptance count changes:56/95 done;37 non-VR unfinished and2 VR paused. GPU validation remains deferred. The initially shared URL needed the creator account; previous HTTP200 only established page availability, not this user's access to private results.
