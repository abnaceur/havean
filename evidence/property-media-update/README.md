# Property upload requirements and engine pause — 18 October 2026

O: Existing application code and its manual media/session/moderation flows; authored synthetic image/panorama fixtures and a small GLB triangle. No real property measurements or visual parity assertion.

R: User requests required photos and a floor plan, optional 360°, 3D plan and video uploads when an agent adds a property, and temporary digitalization engine disablement. The supplied specification remains unchanged.

P: New agent drafts open the media step; saved drafts expose an upload action. API submission requires at least one scanned, attached photo and floor plan; publication requires independent approval of both. Required media cannot be removed from a submitted/reviewed/published listing if that would leave it incomplete. GLB 2.0 models use the existing ownership, scanner, version, review and public-media RLS workflow, with bounded self-contained content validation and embedded texture limits. Shared orbit/zoom/reset preview is available to authors, reviewers and public visitors. Gallery spacing keeps navigation clear of preview controls. Migration 232 adds the new media purpose/kind without changing existing rows.

P: `digitizationEngineEnabled=false` disables private/internal engine routes (503), the interactive workspace and review controls, and worker dispatch/cleanup. Previously approved public engine media remains readable. Local processing CPU and GPU containers are stopped; stored jobs and outputs are retained.

V: `browser-verified.log`: two passing desktop/mobile journeys exercise actual creation and uploads, missing media rejection, owner preview, anonymous denial before publication, independent moderation, publication without video, anonymous model delivery and interactive public preview, and disabled engine UI/API. `unit.log`: three real GLB validation checks pass. `types.log`: ops/web types pass. `api-unit-final.log`: API/UI/worker types pass, followed by a test harness failure because that API container lacks Docker; `unit-final.log` reruns the three GLB checks in the proper Compose test container. `lint.log`: focused lint succeeds with no output. `contracts.log`: all 447 generated operations and OpenAPI/runner schemas match.

V: Earlier runs are retained honestly: `browser.log` used an incorrect public route; `browser-final.log` exposed overlapping gallery navigation and a separate full-page screenshot timeout in the existing mobile draft test. The overlap is fixed and both focused journeys rerun successfully. Three existing draft regression checks passed in that earlier six-test run; it was not a fully passing regression suite. No full release or production readiness claim. Root specification task acceptance and unfinished engine task counts are unchanged.

V: Validation ran on the separate Docker Compose integration environment. Local development startup initially failed because current Compose database/search images do not match existing volume formats. A local-only, ignored compatibility override uses immutable IDs of the original PostgreSQL/search/identity images; existing data volumes are preserved. Final local activation status is recorded below.

V (final local activation): the original-format database, search and identity services are healthy with the local compatibility override. Migration 232 applied successfully without a reset. API, worker, web, ops and proxy are running; `/ops/listings` returns HTTP 200 and a direct engine request returns `DIGITIZATION_DISABLED`. `local-browser.log` passes the complete desktop upload/moderation/public-preview journey on the actual local site (1/1). Integration desktop/mobile remain 2/2. `unit-final.log` passes 3/3; `lint-final.log` is clean; `ledger.log` passes. `release-blockers.log` intentionally fails the existing unfinished UI/release/engine gates.

Local restart command (preserves the existing volumes and leaves processing stopped):

```sh
docker compose -f compose.yaml -f compose.polling.yaml -f infra/generated/property-media-local-compat.yaml up -d --no-deps --no-build db search identity api worker web ops proxy
```

The compatibility file is ignored, contains no secrets, and pins immutable local image IDs. It is not a production upgrade or a replacement for the repository's documented logical migration procedure.
