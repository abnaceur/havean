# Requested Haven UI integration — 10 October 2026

O — The supplied reference URL `https://haven-design-studio.hisec4ever.chatgpt.site/#home` returned HTTP 401 during direct retrieval. The web reader could not open it. Existing local Haven source, brand assets and live synthetic API inventory were inspected; they are implementation evidence, not a captured reference or customer inventory.

R — Preserve SPECIFICATION.html and the existing architecture, market/currency semantics, API-owned business rules, session-backed requests, workflow authorization/version checks and ordered specification tasks.

P — Complete the existing design integration: resolve legacy mobile card specificity, use full property cards and 44px save controls, preserve navigation on phones/tablets, wrap editorial headings, scale hero copy, avoid crowded tablet hero overlays, keep mobile form text at 16px, restore visible search focus, bound dialogs by dynamic viewport height, and use shared light/dark surface/text tokens across discovery and professional workflows. Keep mobile conversation lists and paging controls within the viewport, stack labeled geography records and their actions on phones, and use section headings within analytics/geography pages. Correct the existing private fact-review SDK request to send its idempotency key through supported headers. No API rules or money posting calculations changed.

P — Browser validation uses actual Compose applications and API responses. It checks public pages and live detail navigation, filters, city selection, theme persistence, mobile menu/focus restoration, and real authenticated account/professional entry layouts. The matrix includes 320x740, 375x812, 390x844, 550x800, 768x1024, 800x900, 1024x768, 1440x900, 1920x1080 and 844x390. Tests reject document overflow and horizontally clipped headings/controls; filter scans reject serious/critical axe violations in light and dark themes. Screenshots are current implementation captures, not approved regression baselines.

P — Validation passes: 10 core desktop/mobile browser checks in [responsive-final.log](responsive-final.log), plus two desktop/mobile traversals of 38 loaded category-detail/account/workspace destinations at 320/768/1440 in [navigation-final.log](navigation-final.log). All three UI/web/ops type checks pass in [types-final.log](types-final.log); full lint/import boundaries pass in [lint-final.log](lint-final.log). Nine ledger checks pass in [ledger-guards.log](ledger-guards.log), including rejection of a UI milestone marked done while reference parity is unverified. Ten selected implementation screenshots with actual timestamps, pixel dimensions and SHA-256 hashes are retained in [screens/manifest.json](screens/manifest.json). Auth/session traces remain ignored.

P — The first broad traversal exposed narrow conversation paging controls, duplicate section-level h1 elements and geography actions requiring horizontal scrolling; corrected final traversals are separate. The initial type error, transient ops BFF HTTP 503, interrupted exploratory run and shared output-directory collision are retained in types.log, responsive-first-pass.log, responsive-initial.log and responsive-shared-output-interrupted.log. These failures are not presented as passing evidence.

P — Commands used:

- `docker compose --profile tests run --rm --no-deps tests pnpm exec playwright test tests/e2e/haven-responsive.spec.ts tests/e2e/haven-design.spec.ts --project=desktop --project=mobile --output=evidence/haven-design/browser-results --reporter=list` — 10 core checks passed before the broader traversal was added.
- `docker compose --profile tests run --rm --no-deps tests pnpm exec playwright test tests/e2e/haven-responsive.spec.ts --grep 'category details' --project=desktop --project=mobile --output=evidence/haven-design/navigation-results --reporter=list` — two complete 38-destination traversals passed.
- `docker compose exec -T -w /workspace web pnpm --filter @haven/ui --filter @haven/web --filter @haven/ops typecheck` — passed.
- `docker compose exec -T -w /workspace web pnpm lint` — passed.
- `docker compose exec -T -w /workspace web pnpm exec vitest run tests/unit/digitization-ledger.test.ts` — nine passed.
- `docker compose exec -T -w /workspace web node scripts/tasks.mjs` — synchronized ordinary validation passes.
- `docker compose exec -T -w /workspace web node scripts/tasks.mjs --release` — expected failure for unfinished reference/engine/release work; see release-unfinished.log.


V — Exact linked-reference parity is unverified because reference access is unauthorized (HTTP 401). No measurements, human/parity approval, physical-device/browser coverage, or unrelated digitization completion is claimed. The requested integration remains in progress until reference review is possible. Root specification counts remain 120/120; the separate digitization ledger remains 53/95. Release validation must continue rejecting unfinished work, including this reference review.

P — Authentication design follow-up: login, registration and forgot-password now share the local Haven identity theme. Eighteen additional Compose browser checks and eleven unit checks pass, with full lint/boundaries. See [authentication report](auth/REPORT.md) for the seven-size matrix, full synthetic registration/email-reset journey and selected screenshots. Exact reference parity stays unverified.
