# Haven authentication design — 10 October 2026

O — Inspected the repository’s existing brand assets and the running Keycloak 26.4.7 templates. The linked Haven reference has a recorded HTTP 401 response; no reference content or approval was obtained.

R — Preserve SPECIFICATION.html, native identity-owned credentials, registration, field errors, password visibility, OIDC/PKCE, MFA policy, permitted return routes and application server sessions. Development account credentials remain generated and ignored, and their theme is removed outside development.

P — Added `infra/themes/haven/login` as a shared theme inheriting Keycloak’s native forms. It uses local Haven fonts and wordmark, the existing interior image, green/citron accents, a desktop image panel and a single-column phone form. The form keeps 16px field text, 48–50px controls, visible focus, inline errors and scrollable registration content. Native OTP and password-update pages also inherit this visual shell. Setup copies licensed local assets and the common theme; production/test select `haven`, while development-only shortcuts inherit it. The development identity service was restarted to apply the theme.

P — [Final browser checks](browser-final.log): **16 passed** on desktop and mobile projects. Every login/register/forgot page was checked at 320x740, 390x844, 768x1024, 1024x768, 1440x900, 1920x1080 and 844x390. Checks reject document overflow/clipped forms and axe WCAG 2 A/AA and 2.1 AA violations. Additional checks cover native show/hide password, invalid credentials, registration password mismatch, neutral recovery confirmation, real password sign-in/session return and development persona switching across web/ops. The [initial six checks](browser-initial.log) passed but subsequent visual inspection exposed inherited desktop container padding; the final run verifies at least 400px form width at desktop sizes after its correction.

P — [Full recovery checks](recovery-final.log): **two passed**. The existing account-profile fixture creates a unique synthetic identity, saves its local profile, requests recovery, reads the actual development mail, follows the identity action, replaces the password and signs in with the replacement through standard PKCE. The profile remains intact; fixture profiles are suspended afterwards. No demo-account password was reset.

P — [Unit checks](unit-final.log): **11 passed**, including removal of development credentials/themes outside development, retained shared assets, unchanged MFA environment policy and unfinished-task/reference ledger guards. [Full lint and import boundaries](lint-final.log) passed. No application TypeScript or API business rules were changed in this follow-up.

P — Commands run with Docker Compose:

- `docker compose exec -T -w /workspace web node scripts/setup.mjs` and `docker compose restart identity`.
- `docker compose --profile tests run --rm --no-deps tests pnpm exec playwright test tests/e2e/haven-auth-design.spec.ts tests/e2e/development-login.spec.ts --project=desktop --project=mobile --output=evidence/haven-design/auth/browser-results --reporter=list`.
- `docker compose --profile tests run --rm --no-deps tests pnpm exec playwright test tests/e2e/account-profile.spec.ts --grep 'identity-managed registration' --project=desktop --project=mobile --output=evidence/haven-design/auth/recovery-results --reporter=list`.
- `docker compose exec -T -w /workspace web pnpm exec vitest run tests/unit/development-login.test.ts tests/unit/mfa-policy.test.ts tests/unit/digitization-ledger.test.ts`.
- `docker compose exec -T -w /workspace web pnpm lint`.

P — Selected current implementation screenshots with actual dimensions, timestamps and SHA-256 hashes: [manifest](screenshots.json).

| Page | Desktop | Phone |
| --- | --- | --- |
| Sign in | [1440px](login-desktop-1440.png) | [390px](login-mobile-390.png) |
| Register | [1440px](register-desktop-1440.png) | [390px](register-mobile-390.png) |
| Forgot password | [1440px](forgot-desktop-1440.png) | [390px](forgot-mobile-390.png) |

V — These are implementation captures, not approved visual baselines. Exact linked-reference parity, human approval, physical devices, other browser engines and production identity execution remain unverified. Ordinary task validation and unfinished release rejection are recorded in [task validation](tasks-final.log) and [release validation](release-unfinished.log). Original specification acceptance counts remain unchanged.
