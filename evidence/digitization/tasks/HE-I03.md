# HE-I03 — Private camera observations in progress

Status: in_progress. Private assigned review and selected-camera navigation are implemented; full task and ordered prerequisite acceptance remain unfinished.

## Acceptance

Add approved camera anchors and optional floor-map links. Minimum test: wrong/unverified transform cannot enable plan navigation. The implemented author observation path satisfies the refusal portion; approved navigation and the HE-I02/HE-H05 prerequisites remain unfinished.

## Implementation

Existing immutable scene registrations accept at most fifty uniquely named camera observations. The API fits a proper similarity transform from source-linked scene/plan correspondences and derives each camera's plan position. It requires the current workspace, source revision, eligible private artifact, current metric geometry and selected floor. Each camera must lie strictly inside its selected room, outside polygon holes and their boundaries, and within declared floor height when supplied. Unknown height does not become an inferred height. The API checks exact private tier bytes before camera registration through the session endpoint.

Migration205 applies independent SQL checks for transformed coordinates, room/floor identity, holes, bounds and unique IDs while retaining estimated/pending/no-navigation/no-measurement/no-publication flags. No table or recovery-proof version was added; the immutable registration JSON is already covered by signed recovery digests. Prior immutable registration rows without camera observations remain compatible.

The operations panel records three observed correspondences and an optional observed camera position, shows private history and clears stale input after scope/save errors. Registration uses the generated session SDK. No public viewer consumes these pending observations.

## Tests

`docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T api pnpm test:unit` passes209 tests in64 files: `evidence/digitization/validation/camera-anchor-all-units.log`. Registration tests cover a rotated/scaled/translated fit, degeneracy/reflection, absent/invalid/duplicate/supplied-approval input, room holes/walls, wrong floors and invalid heights.

Real SQL/S3 integration passes both authored desktop/mobile anchor fixtures and the privacy regression. It verifies immutable history, optimistic concurrency, foreign scope404, stale geometry/workspace refusal, transformed hole/outside/height/duplicate denial in SQL and attempted navigation approval refusal. The supporting fixtures use exact authored PNG and exported27-Gaussian bytes; their stage metadata is explicitly authored, not a production decoder or trained reconstruction claim.

`./test-runner-protocol.sh scene-preview` currently retains the initial fixture transition failure (`camera-anchor-scene-workflows.log`), corrected integration/four prior browser passes (`camera-anchor-scene-workflows-corrected.log`), exact room-label selector failure (`camera-anchor-final-scene-workflows.log`) and corrected desktop form plus mobile throttle failure (`camera-anchor-final-browser-corrected.log`). Final `./test-runner-protocol.sh scene-preview` exits0 (`camera-anchor-final-rate-recovery.log`): three real SQL/S3 cases and all six actual desktop/mobile browser journeys pass. The camera journeys save/reload pending history, refuse author-supplied navigation approval, check scoped axe and overflow at320/375/390/768/1440, and exercise bounded reload recovery under the unchanged500-read-per-minute throttle. Screenshots: `evidence/digitization/camera-registration-desktop.png`, `camera-registration-mobile.png`.

All nine sequential workspace types, strict standalone fixture types, full lint/import boundaries and410 canonical generated operations pass: `camera-anchor-workspace-types.log`, `camera-anchor-api-types.log`, `camera-anchor-ops-types-final.log`, `camera-anchor-fixture-types-final.log`, `camera-anchor-full-lint.log`, `camera-anchor-contracts-final.log`. Incorrect standalone compiler module/decorator invocations remain separately retained. Both development and integration migration checks pass. Normal task validation passes; release validation exits1 for the42 unfinished engine tasks and existing root gates.

## Limitations

These are private author observations against authored software fixtures. A small fit residual is not evidence of metric accuracy or a safe navigation path. Independent assigned transform/camera approval, approved camera-driven viewer navigation, trained scene review/publication, physical device and ordered prerequisite acceptance remain unfinished.

## Next dependency

Complete independent exact scene/plan registration and camera review before enabling any floor-map navigation; retain current artifact/geometry/source/version checks at review and serving time.

## O

Actual local Compose PostgreSQL/S3/API/browser observations and explicitly authored plan/Gaussian fixtures. No customer property or physical lens-switch measurement.

## R

Preserved supplied specifications, actor/resource/version/workflow contract, independent approval requirements, signed recovery coverage and authoritative task prerequisites.

## P

Implemented private observation UI/API/SQL and retained actual passing/refusal checks above. No full-task acceptance is inferred from partial passing evidence.

## V

Independent approved navigation, trained reconstruction, production dependency admission, full viewer/device and remaining engine acceptance are unresolved. GPU validation remains deferred by the recorded user decision.

## Independent private registration review continuation — 10 October 2026 (P)

The author explicitly delegates the current exact scene and source-linked plan to an assigned independent moderator/admin. Immutable request snapshots reuse registration history; approval records bind artifact version/checksum, source revision, geometry/floor, observations and explicitly selected camera IDs. Migrations206–207 independently refuse self-review (including an actual temporary author admin membership), other reviewers, stale workspace/source/artifact/geometry and duplicate decisions. No new table or recovery proof version is introduced. Request and decision replay use existing durable idempotency; changed bodies and competing decisions refuse. Actual source bytes and bounded scene bytes are rechecked before delegation, approval and navigation serving.

The reviewer queue uses session SDK routes and explicit preview controls. Approval requires separate transform and selected-camera confirmations. The author viewer lists only approved positions; each click asks the API for current exact approval before moving. Orbit direction is a viewing control, not a recovered heading. Floor up comes from the approved similarity matrix; keyboard/reset and disposal remain in place. New observations immediately invalidate prior navigation. Every navigation output remains estimated, private, without metric measurement or public permission.

P: `registration-review-browser-stable.log` passes three actual SQL/S3/policy/event cases and both desktop/mobile browser journeys. The journeys use real OIDC author/assigned moderator sessions, explicit delegation, exact scene/plan previews, selected-camera approval, scoped axe, camera move, keyboard/reset, five-width overflow, stale-approval refusal and anonymous401. Screenshots: `registration-review-desktop.png`, `registration-review-mobile.png`. These are authored27-splat/PNG fixtures and synthetic automated reviewer attestations, never physical-property or human approval.

All211 unit tests in65 files pass (`registration-review-all-units-corrected.log`); all9 sequential workspace types (`registration-review-workspace-types.log`), final lint/boundaries (`registration-review-full-lint-final.log`) and417 generated operations (`registration-review-contracts-final.log`) pass. Development migration application passes (`registration-review-dev-migrations.log`). Initial numeric JSON serialization, duplicate-test RLS setup, unit import and throttled/browser-service-restart failures remain retained separately. Floor-plan previews now load on explicit request. Expanded ten-lane software regression and retention checks pass (`registration-review-software-suite-corrected.log`), including concurrent same-key submission and changed-geometry refusal in `software-registration-review.log`. The first composite mobile reload failed when the parent scene panel was throttled; its bounded recovery now reloads that parent before retrying the registration panel, under unchanged limits. Strict fixture types pass (`registration-review-fixture-types-final.log`); earlier standalone compiler module/type-root failures are retained. The signed encrypted database/object/runner drill passes with all42 table digests and altered-history refusal (`registration-review-signed-recovery.log`). Its observed79,545.556134ms is local drill time, not a production RTO. The restored full-application drill is now running, not yet accepted.

O: actual local Compose/SQL/S3/OIDC/Chromium/SwiftShader observations, mobile emulation and authored fixtures. R: preserved ordered acceptance and independent exact actor/resource/version/workflow requirements. P: observed private review/viewpoint behavior and checks above. V: trained scene/render/privacy/publication, physical device and full HE-I02/HE-H05/task prerequisites remain unfinished; no release or metric approval is inferred.
