# Role-specific account navigation — 9 October 2026

O/R: The supplied specification and existing reference evidence are preserved. The user reported that all test accounts appeared to have the same view and requested a fix.

P: Default sign-in now opens an account landing resolver using verified API session roles. Buyers receive saved homes, viewings and conversations; owners receive properties, statements and management grants; tenants open their lease portal. Agents and property managers receive their respective dashboards. Developers, vendors, moderators, support and administrators open their existing specialized workspaces. Mixed administrator/finance memberships select administration first. Explicit return paths remain intact. Public My account also resolves the appropriate role destination.

Consumer menus omit owner-only sections for other roles, and directly entered hidden sections show an unavailable state. The role helper is presentation only: API actors, resource scopes, versions, workflow states and financial rules retain authority. There are no database migrations, new money calculations or permission grants in this fix.

Four focused unit checks pass. Full workspace typechecks and lint pass. Initial JSX/import compilation failures are retained alongside corrected logs. The initial desktop/mobile browser run passed 22 of 26 checks; its four failures were ambiguous heading selectors (existing matching h1 and h2). The corrected selectors specify heading level, preserving the actual expected content.

Browser verification runs in Docker Compose against existing development API, BFF, PostgreSQL and identity services. Eleven generated accounts are checked on desktop and mobile, including actual /me memberships, API administration denials for every non-admin account, owner navigation visibility and hidden section rejection. Explicit profile/staff links, public home sign-in and the existing four development login/session switching journeys are included. Authentication traces and generated credentials are excluded from evidence.

V: These are local development implementation checks, not new approved visual baselines, original-site parity approval, production SSO verification, public deployment or complete release CI. Existing off-host, CI, parity and separate unfinished digitization requirements remain independently recorded.

The corrected combined run passed 31/34 checks. Three checks were interrupted during development API restarts (desktop admin, mobile buyer button, mobile developer button); the failures are retained in roles-browser-verified.log. API startup timestamps are separately retained. This is not reported as a clean 34-test pass.

Final targeted recovery passes all six desktop/mobile checks (roles-browser-recovery.log). All 34 distinct role-navigation and development-login project/test combinations therefore have positive evidence across the corrected combined and final recovery runs. Four units, full workspace types and lint pass. The platform ledger remains 120/120 accepted; the independent digitization ledger continues separately. No unfinished task was marked complete by this UI correction.
