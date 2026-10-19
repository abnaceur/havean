## Acceptance
Add tour review and node-level exclusion.
Accepted after HE-G03. Minimum: Excluded panorama does not appear in approved tour manifest.

## Implementation
Independent assigned moderator/admin reviews author-selected private panoramas via explicit author-owned source preview delegation. Owner/private document sources are never ambiently shared with staff. Current author/profile/membership/target/input/tour/source ownership/version/native artifact lineage and review workflow are checked. Original capture candidates retain private/genuinePanoramaConfirmed=false; separate projection/privacy reviewer attestations are required for approval. Canonical approval_records stores immutable tour decisions. Excluded nodes and their hotspots are omitted; unapproved plan-room positions are stripped. Manifests remain privately recorded/publiclyServed=false until separate reviewed inventory/package publication. Existing root review workspace and panorama form host the UI; reviewer selection comes from actual current staff directory, with missing choice empty.
SQL191/192 are applied to both development/integration;151 models generated.191 remains preserved;192 fixes the mandate lock to unit/organization scope.

## Tests
`./test-runner-protocol.sh tour-review` passes one actual native-source/API/SQL/storage/Clam/delegated-preview/independent-review journey and two actual OIDC/session desktop/mobile browser journeys in tour-review-delegated-preview-browser.log. The API journey rejects self review and undeclared captures, confirms actual source fingerprints/ownership, denies unassigned/delegation-external previews, rejects author/admin self approval and stale/reused workflow, excludes node and dangling hotspots from the approved manifest, preserves original candidate private/genuine=false flags, replays idempotent approval and invalidates approval access after a new graph. Browser users explicitly select an independent named reviewer and exclude a capture; reviewer sees only the shared capture, must attest projection/privacy and supply reason, then approves. Approved manifest omits excluded capture and unapproved geometry, remains publiclyServed=false; anonymous preview fails401. CI declarations/attestations are synthetic software fixtures, not actual human/customer/genuine-property approvals.
`docker compose exec -T api pnpm typecheck` passes all nine packages in tour-review-final-updated-types.log.
`docker compose exec -T api pnpm lint` passes lint/import boundaries in tour-review-final-lint.log.
`docker compose exec -T api pnpm test:unit` passes148checks/49files in tour-review-full-units.log.
`docker compose exec -T api pnpm contracts:check` matches386 canonical operations/OpenAPI/native schemas in tour-review-contracts-check.log.
`docker compose exec -T api pnpm --filter @haven/api build` compiles162files without workspace source imports in tour-review-compiled-api.log.
`docker compose exec -T api pnpm contracts:models` generates151schemas in tour-review-models.log; SQL191/192 applied both projects. Draft SQL validated in rollback and fingerprints matched actual native-stage sources in integration. Initial missing pgcrypto digest corrected before191 application to built-in sha256; empty-development fingerprint test was not positive evidence. Initial test syntax error corrected; runtime mandate lock failure fixed by192, preserving191.

## Limitations
Private immutable approval is separate from publication. Tests use synthetic source/declaration/reviewer attestations, not actual customer/human/parity/genuine-property verification. Only author-owned capture previews are delegated; other owner sources require future explicit owner review authority. Geometry approval is separate. No device/headset/GPU, production or whole-engine claim.

## Next dependency
HE-F07 masks and later reviewed inventory/package application.

## O
Self-authored pixels and synthetic CI declarations/actors only.

## R
Preserved specification, source privacy, actual independent review boundary, Abu Dhabi and fixed-empty information rule.

## P
Actual local SQL/source/lease/artifact/review implementation and recorded attempts.

## V
no customer/country/human/parity/hardware/publication or whole-engine claim.
