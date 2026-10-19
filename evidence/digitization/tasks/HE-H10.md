# HE-H10 — Scene privacy and incomplete-room labels

## Acceptance

Enforce scene privacy review and incomplete-room labels. Minimum: unreviewed scene never appears publicly; partial scene identifies covered rooms. In progress: private scene inspection and coverage declarations are implemented; independent trained-scene approval and public package integration remain unfinished, as do HE-H09 prerequisites.

## Implementation

The API owns immutable author inspection declarations tied to exact artifact version/checksum, source input revision and current plan revision. Author status includes not inspected, issues found and ready for independent review. All responses retain pending review and publiclyServed=false. This workflow cannot create approval records or public packages. Each current plan room requires an explicit covered/partial/excluded/unknown status; absent plans retain unknown coverage. A source/geometry/tier change invalidates the current declaration. The ops panel uses generated server-session SDK operations and resets drafts on scope changes/failure. It displays recorded incomplete-room labels and separates author inspection from independent review. Thumbnail masking does not claim splat removal.

Migration 204 adds scoped RLS, source/actor/workspace version/workflow checks and an immutable trigger. The server verifies exact tier bytes outside SQL before recording; final SQL rechecks current authority and dependencies. Concurrent saves share the workspace lock and only one can consume a version. Capacity is bounded. Module ownership and the signed recovery table inventory include the new table. The existing real scene-preview lane now also tests the declaration port.

## Tests

`./test-runner-protocol.sh scene-preview` passes one real API/SQL/S3 integration case and four actual desktop/mobile browser journeys (`scene-privacy-keyboard-final-browser.log`). Checks include exact bytes, source rejection, foreign tenant, stale workspace/geometry references, competing declarations, direct-SQL foreign-room refusal, immutable history, archived-workspace refusal, pending flags and absent-plan unknown coverage. Three coverage tests pass in the full 206-test/64-file unit suite (`scene-privacy-final-unit-ledger-checks.log`). All nine sequential workspace typechecks, 409 canonical contracts and lint/boundaries pass (`scene-privacy-final-broader-checks.log`); final keyboard UI/ops types and lint pass (`scene-privacy-keyboard-final-checks.log`). Both schema upgrades apply migration204 successfully.

`flock -n /tmp/haven-integration.lock ./test-processing-recovery.sh --database` passes with nineteen exact table digests including declarations, signed database-drift/ciphertext tamper refusal, real decoder bytes, interrupted-upload/completed-result/deletion-tombstone recovery and owned cleanup (`scene-privacy-signed-recovery.log`). Its observed63,062.916395ms includes fixture cloning/negative/positive verification, excludes final cleanup and does not establish production RTO, off-host recovery or restored-application acceptance. Initial tests are retained separately: scene-privacy-initial-tests.log used a persona with no agency membership; scene-privacy-initial-browser.log omitted the required Origin header; scene-privacy-final-browser.log expected 400 instead of the canonical 422 validation response. scene-privacy-broader-checks.log exited 137 during parallel workspace types; sequential revalidation is required.

## Limitations

No actual trained scene, independent scene reviewer delegation/decision, training-frame privacy lineage admission or public reconstruction package has been accepted. Ready for independent review is an author declaration only. The coverage UI is not automatic geometric completeness detection. Real no-plan browser fixtures and coverage validation do not establish representative reconstructed-room accuracy. GPU validation remains deferred by the recorded user instruction. No hardware, human/parity, production or whole-engine acceptance is claimed.

## Next dependency

Complete admitted HE-H09 exports and training-frame privacy lineage, independent exact-scene render/privacy review and J02–J05 package publication before final H10 acceptance. Complete verified registration/anchors separately before plan navigation or metric displays.

## O

Self-authored 27-Gaussian export and plan pixels; actual isolated PostgreSQL/S3/API/Chromium observations; CI actor declarations rather than human acceptance.

## R

Preserved specification; exact dependency acceptance, API-owned actor/scope/version/workflow mutations; original/source/splat privacy; unknown coverage remains unknown.

## P

Implemented private immutable declarations, bounded validation, scoped session UI and retained actual checks.

## V

Independent scene review/public package, real trained scene/room coverage, production admission, GPU/headset, human/parity and complete-engine gates remain unresolved.

## Construction workflow follow-up — 13 October 2026 (O/R/P/V)

See [construction rework](../construction-rework.md) for the dedicated studio, immutable metric corrections, wall visibility and captured-scene evidence. Focused functional evidence only; no new task acceptance or independent visual approval.
