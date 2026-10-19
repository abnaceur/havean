## Acceptance
Extend existing panorama viewer/hotspots and capture review; preserve approved-tour predicates.
Accepted after HE-G02. Minimum: Existing two-node tour plus new reviewed capture passes keyboard/touch/fallback tests.

## Implementation
Shared existing panorama renderer in packages/ui; existing public web entry re-exports the same renderer. Operations uses session API current panorama candidates and immutable private tour revisions. Empty capture labels/headings/declarations require user entries. Optional room links require current geometry. Explicit hotspot targets and angles are supplied by users. Close/Escape disposes rendering resources and restores focus. Refresh re-reads current candidate scope and retains entries only for current captures. Private candidates remain unconfirmed; declarations never certify source truth.

## Tests
`./test-runner-protocol.sh panorama-review` generated two actual native-source fixtures. Initial combined browser run retained six positive legacy media checks and two failed private keyboard expectations (button15 degrees versus actual keyboard10). `flock -n /tmp/haven-integration.lock docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests run --rm --no-deps tests pnpm exec playwright test tests/e2e/digitization-panorama.spec.ts --project=desktop --project=mobile` passes all four desktop/mobile checks in panorama-review-corrected-browser.log: empty fields, private save/read, keyboard and actual mobile touch, retry, source failure detail isolation, focus/close/Escape cleanup and actual image fallback under unavailable WebGL. Legacy two-node moderation/navigation/retry/exclusion predicates passed in panorama-review-real-browser.log; no clean combined8/8 claim. Synthetic capture approval uses the actual independent CI moderation actor, not real human approval.
`./test-runner-protocol.sh tour-graph` passes the real source/API/database/Clam/storage/runner journey with additional current candidate list/tier/private metadata and foreign-access assertions in panorama-review-candidate-scope.log.
`docker compose exec -T api pnpm typecheck` passes all nine workspace packages in panorama-review-all-types.log.
`docker compose exec -T api pnpm test:unit` passes147 checks/48files in panorama-review-full-units.log.
`docker compose exec -T api pnpm lint` passes lint/import boundaries in panorama-review-final-lint.log.
`docker compose exec -T api pnpm contracts:check` matches380 canonical operations/OpenAPI/native schemas in panorama-review-contracts-check.log.
`docker compose exec -T api pnpm --filter @haven/api build` compiles159files without workspace source imports in panorama-review-compiled-api.log.

## Limitations
Self-authored synthetic sources, no real customer/country/human/parity/device capture. Genuine source declaration remains independent-review pending. No physical headset/GPU, production or whole-engine claim.

## Next dependency
HE-G04 positioning and HE-G05 independent node review; HE-F05 recording is now in progress.

## O
Synthetic self-authored pixel sources and CI actor metadata.

## R
Preserved specification and approved-tour predicates; Abu Dhabi and missing-data empty-first rule.

## P
Actual local source pipeline fixtures and implementation checks above.

## V
no human/parity, real customer or hardware benchmark claimed.
