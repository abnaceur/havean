# Development test account buttons — 6 October 2026

P: User-requested development convenience: all eleven generated personas appear on the Keycloak login page. Buttons fill and submit the normal username/password form. Existing authorization-code/PKCE callbacks, server sessions and return routes remain in use. The later user instruction below supersedes the initial staff OTP behavior.

P: Setup generates `haven-development` only with explicit `NODE_ENV=development` and `DEV_PASSWORD`. Credentials remain in ignored generated assets excluded from Docker builds. Setup removes stale assets outside development or without the password. Identity reconciliation selects this theme only in development and clears its selection otherwise. Compose mounts the respective development/integration theme directories.

O/R: No new benchmark observations or retrieved benchmark login evidence. Implementation follows the [official Keycloak theme mechanism](https://www.keycloak.org/ui-customization/themes).

V: No reference parity claim or approved visual baseline for this local utility.

Initial verification in Docker (before the later password-only instruction):

- One passing unit test in `tests/unit/development-login.test.ts`: generation in development; removal in production/test/unspecified modes; no generation without a password.
- Focused ESLint for scripts and tests passed; `pnpm typecheck` passed for all nine workspace packages.
- `pnpm exec playwright test tests/e2e/development-login.spec.ts --project=desktop --project=mobile --output=test-results/development-login-verification`: four passing checks. All eleven buttons are visible; buyer sign-in preserves the profile return route; developer receives an OTP challenge without an application session and gains its role after actual OTP.
- `pnpm exec playwright test tests/e2e/sessions.spec.ts --project=desktop --grep F06 --output=test-results/development-login-regression`: two passing existing regressions cover invalid OTP denial, real staff OTP, session rotation, expiry and provider logout.
- `pnpm task:validate`: platform 120 tasks / 95 done; digitization 95 tasks / 9 done. No status changes for this convenience addition.
- `git diff --check` passed.

The initial browser run overlapped identity recreation and failed on a Bad Gateway page and a stale login attempt. The complete rerun passed after identity health and realm reconciliation. No production deployment or whole-suite success is claimed. Browser traces remain ignored because they can contain local credentials.

## Later instruction: skip one-time codes in development

P: The user explicitly requested skipping the authenticator step in development. Setup and identity reconciliation now select a separate password-only `haven-development-browser` flow only for `NODE_ENV=development`. The API requests ACR 1 and permits authenticated staff sessions without ACR 2 only in that mode. JWT verification, session lifecycle, actual memberships and resource authorization remain in place. Production/test/other modes select the existing MFA flow, request ACR 2 and reject staff sessions below that level. No fabricated MFA claim or request-controlled bypass is introduced.

P: Development setup now preserves the bind-mounted themes directory when regenerating assets. Replacing that directory caused Keycloak to retain a mount of the removed directory; the failed initial browser run exposed the issue. The unit regression verifies directory identity and refreshed assets. The local identity container was recreated and reconciled after this fix.

O/R: No new benchmark evidence. V: No parity approval or production deployment verification.

Final verification in Docker on 6 October 2026:

- Two focused units passed: development asset generation/removal/mount stability, and password-only versus enforced-MFA policies including missing/invalid ACR values outside development.
- Eight desktop/mobile browser checks passed with `pnpm exec playwright test tests/e2e/development-login.spec.ts tests/e2e/sessions.spec.ts --project=desktop --project=mobile --grep 'development|F06' --output=test-results/development-password-only-final`. These exercise all persona buttons, buyer return route, developer sign-in without OTP and actual staff API access, session rotation, expired-session denial and provider logout.
- Focused ESLint, identity/setup script syntax, standalone MFA policy type check, application boundary check and diff whitespace check passed.
- Full workspace type checking did not pass: concurrent changes produced errors in `inventory/digitization/multipart.ts` (ListParts marker number/string types) and `management/financial-reversals.ts` (missing contract exports). No full type-check success is claimed for this snapshot.
- Task validation passed with 120 platform tasks / 96 done and 95 digitization tasks / 12 done. This login adjustment changes no task statuses; these counts reflect concurrent work.

Historical MFA browser evidence above describes the earlier behavior. Current development session tests branch explicitly on environment; their non-development branch retains actual OTP verification. Production MFA enforcement is covered by focused policy tests here, not by a claimed production browser run.

## Development account-switching correction

P: Reopening application sign-in in development now ends the current application's stored session and calls the existing Keycloak refresh-token logout protocol before starting a new authorization flow. Provider unavailability returns a retryable error instead of proceeding with the previous account. Local same-host Keycloak identity/authentication-flow cookies are expired at both realm-path spellings, including orphaned browser state when the application cookie is missing. Cookies ignore the different local ports; the hostname check confines this cleanup to the configured local identity hostname. Production sign-in never executes this reset. State/nonce/PKCE, allowed origins/return paths, token verification and current membership authorization remain enforced.

The old API process was running without source watching; a test against that process reproduced the user's exact different-user/manager error. Restarting into the development Compose command applied the change. During implementation a duplicated Set-Cookie accumulation caused a header overflow; this was corrected to use Fastify's native cookie-header appending. No claim is made that these failed attempts passed.

Verification:

- Final dedicated account-switching run: four desktop/mobile checks passed with `pnpm exec playwright test tests/e2e/development-login.spec.ts --project=desktop --project=mobile --grep switch --output=/tmp/haven-account-switch-final --reporter=line` in the Docker test service. Manager → agent → buyer succeeds in one browser across ops/web; replaced application session identifiers receive 401. Manager → agent also succeeds after removing only the application cookie, without manual provider logout.
- The preceding combined login/session run passed eleven of twelve checks. Its desktop switching callback encountered Bad Gateway during a web/ops restart; the final dedicated rerun above passed. The other eleven checks include buyer/developer login, no development OTP, account switching, lost-cookie recovery, session rotation, expiry and logout across desktop/mobile.
- Full workspace type checking, two environment-policy/theme units, focused lint, import boundaries and whitespace checks passed during this correction. Task validation passed: 120 platform tasks / 96 done; 95 digitization tasks / 14 done. No task status was changed for account switching.
- Provider logout uses the application's existing refresh-token logout integration, documented in [Keycloak's OIDC endpoint reference](https://www.keycloak.org/securing-apps/oidc-layers); this local fix does not change the production logout protocol.

O/R: No new benchmark observations/retrievals. V: No parity or production deployment verification. Browser artifacts remain private and uncommitted; the final focused run used container-local temporary output to avoid concurrent cleanup of the shared test-results directory.

## Restore the live development identity connection

P: A subsequent live configuration check found the primary API recreated with `/tmp/p09-primary-auth-runtime.yaml`, using the temporary identity server at port 8095 rather than the configured development server at 8090. That temporary realm did not have the account-button theme. Both identity containers also advertised the `identity` alias on `haven_private`, causing ambiguous routing and an identity-admin 401 during restoration.

Restored the primary API from `compose.yaml` with `.env`, keeping development credentials and buttons. Reconnected the temporary identity container using only its distinct `identity-p09` alias, preserving its service while removing the conflicting `identity` alias. Restarted API/proxy to remove stale connections and successfully reconciled the canonical development identity. Confirmed primary runtime: NODE_ENV development, public issuer localhost:8090, internal identity:8080, only compose.yaml in its configuration label.

Final browser verification: four desktop/mobile button/login checks passed using `pnpm exec playwright test tests/e2e/development-login.spec.ts --project=desktop --project=mobile --grep buttons --output=/tmp/haven-buttons-canonical-identity --reporter=line`. All eleven buttons are asserted; buyer and developer authenticate with the correct roles and no development OTP. The initial restoration run failed while the duplicated identity alias and restarts were being resolved; no success is claimed for that attempt. A fresh page screenshot is saved as `evidence/development-login-buttons.png`; it is local evidence, not an approved visual baseline.

O/R: No new benchmark evidence. V: No parity or production validation. No task statuses changed.
