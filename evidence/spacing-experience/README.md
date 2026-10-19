# Application spacing — 18 October 2026

Status: complete.

O/R: The user requested spacing improvements across all current pages. The current repository and rendered application are the source of truth. `SPECIFICATION.html` remains unchanged; its proposed spacing scale is not presented as a measured external benchmark.

O: Baseline browser screenshots show the mortgage fields and Calculate button touching, and inconsistent separation between plain content headings, forms and actions. Existing shared CSS also used 34px action buttons in some record rows, mixed margins with layout gaps, and stacked home-section margins with section padding.

P: Added `packages/ui/src/haven-spacing.css`, imported last by both application layouts. It defines shared 4/8/12/16/24/32px spacing tokens, responsive panel padding, section spacing, label/input/helper grouping, 44–48px action targets, wrapping action groups, table padding, and consistent card/record spacing. Plain settings/review sections receive heading and paragraph spacing without applying global margins to immersive overlays. Standard dialogs retain scrolling; the wizard and full-screen media shells retain their dedicated layouts.

P: The mortgage form uses a spaced field stack and an associated interest-rate hint. Invitation and revision decisions now use explicit action groups. Long property-name buttons wrap inside the tablet map column. Management tabs have consistent gaps, touch targets and themed active text. Profile forms have separation before the following section.

V: Verification artifacts:

- `before-*.png` / `after-*.png`: local browser screenshots; public, account and professional layouts at narrow and wide widths.
- `baseline.log`: baseline capture completed.
- `browser-final.log`: 4/4 browser checks pass. `routes.json` records 61 distinct public, account, tenant and professional routes checked at 320/768/1440 CSS pixels. Additional filter/dialog checks cover 375/390px, light/dark themes, keyboard dismissal/focus return, field gaps and action heights. Sign-in, registration and recovery pass at 320/768/1440px.
- `crowding.json`: the route audit identified two remaining heading/copy issues at three widths each: homepage owner callout (6px) and development heading (0px). Both are fixed and verified at a minimum 12px gap in the supplemental run.
- `browser-supplement.log`: 3/3 pass: isolated desktop wizard regression; owner profile and property-request/support pages, all seven management views, lease dialog geometry/accessibility and focus return; final homepage/development text spacing. `management-views.json` records the seven tabs at 320/768/1440px. Profile section separation is at least 32px; mortgage field and action separation is at least 24px.
- `regression-first-pass.log` plus `browser-supplement.log`: all ten desktop/mobile media, mortgage and property-wizard regression journeys are verified. Nine passed initially; the one desktop wizard callback timeout passed in the isolated rerun.
- `typecheck.log`, `lint.log`, `boundaries.log`: application TypeScript, focused lint and import-boundary checks.
- `release-in-progress.log`: release validation rejects this task while unfinished, alongside existing release blockers. `ledger-final.log` records synchronized completion; `release-blockers.log` preserves the remaining unrelated release rejection.

V: Initial checks found tablet map-button overflow, corrected by wrapping long labels. The first route harness used obsolete account URLs, then was corrected to discover current authorized navigation. A later route reload and one desktop wizard sign-in hit development authentication/readiness timeouts. Subsequent checks use explicit hydrated UI readiness and isolated browser runs. First regression run passed 9/10; the remaining failure occurred at the identity callback before exercising the wizard UI. Authentication callback query parameters are redacted in the saved regression log.

V: Visual inspection covered narrow/wide browse, mortgage, profile/privacy, owner request, commercial detail, staff review/administration/development/support, management and authentication layouts. Checked accessibility states contain no serious or critical axe violations.

No physical-device, external reference-parity or production-deployment approval is claimed. Existing unfinished UI/reference, recovery, CI and digitization release gates remain separate.
