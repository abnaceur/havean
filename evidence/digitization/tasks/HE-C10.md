## Acceptance
Add revision-aware reuse/invalidation. Media change leaves OCR artifact reusable but invalidates scene approval.

## Implementation
Immutable input-domain changes and dependent approval invalidations are persisted. Document/OCR/fact identity excludes unrelated media changes; plan/media/scene dependencies invalidate selectively. Only byte-verified private CPU PNGs from the same workspace and exact compatible source/profile/software lineage can be reused. Current source bytes are rescanned before reuse. Old PNG bytes, hash, dimensions and complete page group are verified; new current-revision artifacts receive private/pending status and immutable reused-from lineage. Actor, target, source grants, current input, lease and fence are rechecked on commit. No approval transfers with cached pixels. New packages require a current package-specific approval; prior public versions are retained. Completed graphs enter awaiting_review, respecting the existing workflow guard and releasing active processing reservations.

## Tests
`./test-runner-protocol.sh plan-editor` — revision-reuse-state-fixed.log records two actual integration tests and ten desktop/mobile journeys. The reuse integration processes a genuine self-authored PNG, appends an actual photo while keeping document bytes unchanged, checks unchanged OCR dependency identity and invalidated scene approval metadata, then concurrently starts the new run. Zero actual CPU submissions occur; both callers receive the same succeeded receipt. A new private current-revision artifact has identical verified bytes, new lineage and pending privacy review. Current page selection works; old selection and cross-agency preview reject. Approval rows used for lifecycle testing are explicitly synthetic metadata, not human approval or a reconstructed scene.
`docker compose exec -T api pnpm test:unit` — revision-reuse-unit-final.log: 125 tests/40 files pass, including two domain-policy tests for media changes, ordering, byte/version/purpose changes and inaccessible-history conservative invalidation.
`./test-runner-protocol.sh` — revision-reuse-runtime-private-intake.log: all eight actual Node/Python/queue/PostgreSQL/storage journeys pass. Cancellation uses a distinct private intake so cache reuse cannot substitute for actual process termination. Retained failures revision-reuse-runtime-final.log and revision-reuse-runtime-checksum-fixed.log show the original cache-hit test assumption and checksum refusal; production checksum checks were preserved.
Nine workspace types, lint/import boundaries and 365 canonical operations pass in render-reuse-types-final.log, revision-reuse-lint-final.log and revision-reuse-contracts-final.log. SQL181–182 applies to development/integration. Earlier leased-to-succeeded and running-to-ready attempts remain recorded; implementation now follows leased-to-running-to-succeeded and awaiting_review without relaxing applied guards.

## Limitations
Actual reused pixels are CPU renders. OCR reuse is its dependency/compatibility policy: an OCR model/artifact is not enabled and no OCR accuracy or output is invented. No source grant, reviewer approval, scene or public package is inherited. Corrupted cache storage fails closed. Model/config compatibility must be implemented for each future processor before it can use this policy.

## Next dependency
HE-R07 reviewed inventory application, HE-F01 media probing, and HE-D02 licensed isolated OCR integration.

## O
Self-authored PNG/photo and explicit synthetic approval lifecycle metadata only.

## R
Supplied revision-aware reuse, affected dependency invalidation and current actor/source/version/state architecture.

## P
Actual verified CPU bytes/private storage, concurrent API receipts, database invalidations and live runner/browser regressions.

## V
No human/parity approval, country accuracy, actual OCR artifact, GPU reconstruction, headset or production completion.
