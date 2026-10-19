# COLMAP-to-gsplat background integration — 13 October 2026

O: user requested “construct the gsplat”, having confirmed COLMAP + gsplat and explicitly deferred GPU validation. The existing licensed reference-derived CPU fixture supplies a real calibrated archive. The published example remains unchanged and contains authored furnishings.

R: preserve source permissions, frame privacy, actor/resource/version/workflow checks, private review before publication and exact task minimums. HE-H06 requires a real GPU dataset producing a loadable checkpoint and nonempty scene; CPU/authored results cannot satisfy that minimum.

P: migration 227 binds a calibrated report/archive to durable training/export stages. The API/worker flow adds exclusive GPU reservation handling, a separately keyed private runner, confined bounded training adapter, signed checksum-addressed output download, exact PLY/finite-attribute and viewer encoding checks, PNG dimensions, fenced private S3 collection, dependent viewer export, cancellation/deletion routing and agent progress/reload/scene-review controls. GPU execution stays default-disabled and production-ineligible. The optional Compose/Dockerfile configuration requires an audited runtime; it was not built or started.

Minimum validation performed:

- `gsplat-workflow-functional.log`: real isolated PostgreSQL/S3/API/signed HTTP orchestration using explicitly authored scene output. Pass: disabled gate, idempotency, stale version, duplicate active job, changed dataset refusal with no committed output, five private training artifacts, two private viewer exports readable through the actual private viewer port, scoped status, foreign-organization refusal, cancellation/late-result fencing, failed-job reservation release. Three authored source transfers; no CUDA. The first attempt exposed a local-export leased-to-succeeded transition error; start now renews the stage to running before collection, and the corrected journey passes.
- `gsplat-runner-cpu.log`: two CPU-only checks pass. Output metadata/hash collection, disabled training refusal, symlink refusal and real Linux training-profile confinement on authored files; foreign reads, input writes, sockets and forks denied, scoped threads permitted. No GPU probe/import/training.
- `gsplat-deferred-browser.log`: one real Agent Demo browser check passes (15.3 seconds). The training button is disabled with the explicit GPU-deferral reason, and the retained 16-view calibrated camera result remains accessible. No new camera job or source revision was created.
- `gsplat-checks.log`: API/ops types, two targeted recovery descriptor checks (four unrelated tests skipped), and generated contracts pass (441 API operations). Focused lint and task-ledger validation are recorded in `gsplat-final-checks.log`.

The isolated integration worker was stopped only during the SQL/S3 journey and restarted afterwards. The ordinary development worker continued running. Migration 227 was applied to both local and isolated integration databases. No public source, model or publication state changed.

## Reproduction

CPU protocol/confinement:

```sh
docker compose -f services/property-processing/compose.tests.yaml run --rm --no-deps \
  -v "$PWD/services/property-processing/property_processing:/opt/processing/property_processing:ro" \
  -v "$PWD/services/property-processing/tests:/opt/processing/tests:ro" \
  cpu python -m pytest -p no:cacheprovider -q -s tests/test_training_execution.py
```

Browser (retained local fixture, Agent Demo login):

```sh
docker compose --profile tests run --rm --no-deps \
  -e HAVEN_CAMERA_REVIEW_WORKSPACE=9acf2520-a922-4b23-830e-0a55aa0b97a6 \
  tests pnpm exec playwright test tests/e2e/digitization-gsplat-deferred.spec.ts --project=desktop
```

The isolated orchestration journey uses `tests/support/gsplat-camera-fixture.ts` to export only the known CPU fixture and calibrated archive into ignored `infra/generated/integration/gsplat/`, imports that test fixture into the isolated database, and uploads its archive with the helper's `storage` mode. It creates its own temporary test key and virtual reservation, with no physical GPU registration. Stop only the isolated integration worker before this command and restore it in a shell exit trap:

```sh
docker compose -p haven-integration --env-file .env.integration -f compose.yaml -f compose.integration.yaml \
  exec -T -e HAVEN_CONTAINER_TESTS=true api pnpm exec tsx --tsconfig apps/api/tsconfig.json tests/support/gsplat-workflow-functional.ts
```

V: this verifies software orchestration, not trained scene quality. No real CUDA execution, runtime build/download, physical GPU setup, GPU admission, independent privacy/render approval, automatic furniture meshes, surveyed dimensions, production deployment or full-release claim. GPU validation remains deferred and VR paused. Root 120/120 and engine 56/95 acceptance unchanged; 37 non-VR tasks unfinished plus two paused VR tasks. Recovery proof v7 includes the new binding table; no new full recovery rehearsal was run. [Runtime requirements and next validation](../../docs/runbooks/gsplat-investigation.md).
