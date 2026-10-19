# HE-F07 — private training frame privacy

## Acceptance

Accepted: Add privacy exclusions/masks before reconstruction. Sensitive self-authored fixture regions are black in actual prepared training PNGs; an excluded source frame is absent from the training TAR. This private input port prepares pixels for reconstruction; it does not claim completed reconstruction or public privacy approval.

## Implementation

API-owned bounded Sharp pixel masking, metadata-free deterministic PNGs and controlled-path 32MiB TAR. Immutable current scoped dataset recipes pin version/input/selected artifacts and PostgreSQL JSONB fingerprints. Current native source hashes/Clam checks and authority are checked before and after preparation; concurrency2/time60seconds budgets. All-excluded recipes fail preparation with recapture guidance. Existing ops route adds original frame inspection, empty coordinate fields, explicit masks/exclusions and inspection confirmation. No inferred sensitive regions, camera parameters or scene quality.

SQL193/194 applied to both Compose projects.194 fixes runtime ambiguous mask alias;193 remains unchanged.152 generated models,388 canonical operations and164 compiled API files.

## Tests

- `docker compose exec -T api pnpm exec vitest run tests/unit/digitization-frame-privacy.test.ts` —3 pass: every masked pixel black, outside pixels unchanged, deterministic output, malformed bounds/metadata/path/archive budgets. Log: evidence/digitization/frame-privacy-pixel-units.log.
- `./test-runner-protocol.sh frame-dataset` —1 corrected native/Clam/S3/API/SQL/current-source journey pass, including actual sensitive PNG pixels, exclusion, immutable recipe/idempotence, source original preservation, foreign404/stale409 and all-excluded422. Log: evidence/digitization/frame-privacy-native-scope-corrected-workflow.log. Earlier SQL alias and foreign-status assertion failures retained separately.
- `./test-runner-protocol.sh frame-privacy` —1 native fixture journey plus2 real desktop/mobile OIDC/browser inspection/mask/exclusion/download/reset checks pass. Log: evidence/digitization/frame-privacy-real-browser-workflow.log.
- `docker compose exec -T api pnpm test:unit` —151 pass/50 files; evidence/digitization/frame-privacy-full-units.log.
- `docker compose exec -T api pnpm typecheck` —nine packages pass; evidence/digitization/frame-privacy-final-types.log.
- `docker compose exec -T api pnpm lint` —pass; evidence/digitization/frame-privacy-lint.log.
- `docker compose exec -T api pnpm contracts:check` —388 operations/schema checks pass; evidence/digitization/frame-privacy-contracts-check.log.
- `docker compose exec -T api pnpm --filter @haven/api build` —164 files pass; evidence/digitization/frame-privacy-compiled-api.log.
- `docker compose exec -T api pnpm contracts:models` —152 models; evidence/digitization/frame-privacy-models.log.

## Limitations

Manual rectangles are user-supplied and unverified. They do not establish that every sensitive region is found. Original private frames are retained. Scene export requires independent privacy review; splat privacy cannot be established by thumbnail masking. No customer captures, training/GPU, headset, human review or public package verified. Time checks run between bounded operations. Prepared archive is a read derivative, not a forged processing receipt or public artifact registry entry.

## Next dependency

HE-H01 real pinned camera reconstruction and later HE-H10 independent scene privacy review consume appropriately prepared inputs.

## O

Self-authored synthetic clip/pixels, supplied CI annotations and actors; no genuine customer measurements.

## R

Preserved specification §7–8, private source grants, exact version/workflow guards, Abu Dhabi priority, missing fixed document fields remain empty.

## P

Actual Compose native decoder/API/PostgreSQL/private storage/Clam/browser pixel and authorization evidence above.

## V

No human/parity approval, physical GPU/headset, customer accuracy, production deployment or whole-engine completion claim.

## Photo/video workflow correction — 13 October 2026 (O/R/P/V)

See [capture reconstruction evidence](../photo-reconstruction.md) for real-photo admission, immutable source checks and the agent capture-to-scene workflow. No task acceptance is advanced by this follow-up.
