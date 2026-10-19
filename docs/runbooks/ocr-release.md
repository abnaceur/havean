# Offline CPU OCR release

O: HE-D02 uses PaddleOCR3.3.3, PaddlePaddle3.2.2 and PaddleX3.3.13 with immutable English/French/Arabic detector and recognizer files. R: scanned PDF/PNG/JPEG results stay private, source-linked and pending review. Missing or conflicting evidence never becomes an approved property value. Country-specific automatic extraction, optional structured suggestions, GPU and VR have separate acceptance gates.

## Build the exact package

Use Linux amd64 and Docker Compose. The processing host must support Landlock ABI6 or later and seccomp; an unsupported kernel refuses decoding/inference. Downloads occur only in these build services. The runtime uses local pinned weights and has no model-download path.

From the repository root:

```sh
mkdir -p services/property-processing/.ocr-sources services/property-processing/.ocr-wheels services/property-processing/.media-sources
export PROCESSING_BUILD_UID="$(id -u)" PROCESSING_BUILD_GID="$(id -g)"
docker compose -p haven-ocr-release-build -f compose.ocr-release-build.yaml --profile bootstrap run --rm --no-deps ocr-source-download
docker compose -p haven-ocr-release-build -f compose.ocr-release-build.yaml --profile bootstrap run --rm --no-deps ocr-input-download
docker compose exec -T api node scripts/ocr-release.mjs --verify-cache
docker compose -p haven-ocr-release-build -f compose.ocr-release-build.yaml build --builder default ocr-release
docker compose -p haven-ocr-release-build -f compose.ocr-release-build.yaml run --rm --no-deps ocr-release
```

The first downloader retains every source/distribution archive by exact URL, size and SHA256. The second verifies all wheels, models, Debian archive members and unmodified Intel libraries and recreates the offline input cache. It also verifies the pinned media source. Existing valid cache entries are reused. Interrupted or unavailable downloads fail the build; never substitute an unpinned version. No generated caches or credentials belong in Git.

The result is `haven-processing-ocr:3.3.3-offline-cpu-v1`. The build verifies the 270 declared runtime files, 63 installed package versions, excluded files, retained notices and source archives. Original investigation profiles remain separately gated; their flag cannot activate production OCR. API and runner both require the SHA256 of `services/property-processing/ocr-production-release.json`.

## Minimum functional validation

With the existing isolated integration application running, execute `./test-ocr-release.sh`. It uses the immutable local image ID with production OCR flags, no processing-source mount and a disposable private runner. Four checks cover actual English/French/Arabic raster-PDF OCR and one PNG source, original page/hash/token/crop persistence, review/plan linking, stale/tampered input refusal and repeat collection. It neither resets the integration database nor publishes property content. The intentionally skipped JPEG duplicate is covered by retained local image-flow evidence. No GPU, VR or broad-suite execution is required by this OCR packaging task.

P: exact logs and the tested image ID are recorded in `evidence/digitization/tasks/HE-D02.md`. A digest change requires package verification. A runtime/code/model change requires the corresponding focused functional check.

## Production activation

The supplemental configuration is `compose.ocr-production.yaml`, used with `compose.production.yaml`. Complete the normal application release process, including building the API image from the changed `infra/Dockerfile.production`, which packages the matching OCR manifest. Publish the verified processing image only through the authorized release process; then select its **registry manifest digest**, not the local Docker image ID, in protected deployment configuration:

- `PROCESSING_OCR_IMAGE_REPOSITORY`: approved registry/repository.
- `PROCESSING_OCR_IMAGE_SHA256`: registry manifest SHA256, without the `sha256:` prefix.
- `PROCESSING_OCR_RELEASE_SHA256`: SHA256 of the packaged release JSON.
- `DIGITIZATION_RUNNER_KEY_FILE`: absolute protected HMAC key file readable by the API UID1000 and processing UID10001 through an administrator-managed ACL. Keep it outside the repository and unreadable to unrelated users. Do not make it world-readable. The same mounted file serves both endpoints.
- `DIGITIZATION_COORDINATOR_KEY`: independent protected coordinator credential shared only by API/worker.

Use the same protected environment/configuration handling as `docs/runbooks/deploy-production.md`. Validate the combined configuration before activation:

```sh
docker compose --env-file /protected/deployment.env -f compose.production.yaml -f compose.ocr-production.yaml config --quiet
```

The runner has no published host port, uses an internal processing network, read-only filesystem, UID10001, no Linux capabilities, no-new-privileges, bounded CPU/RAM/PIDs/scratch, a persistent execution volume and disabled investigation/simulator/camera profiles. The API reaches it through the fixed internal origin and preserves actor/scope/version/workflow checks. Readiness fails on a missing or changed runtime pin. Keep signing keys stable across restarts so pending receipts remain verifiable; runner configuration, including release SHA, participates in signed recovery records.

For rollback, use the last validated API/worker/processing image digests and matching release SHA. Drain or cancel active OCR work through the application before removing the runner. Preserve its execution volume and signing key; do not erase pending job evidence.

## Distribution material and limits

Ship `/usr/share/doc/haven-processing/source-notices`, `/usr/share/doc/haven-processing/ocr-sources` and the included review with every copied image. These include relevant corresponding sources, patches and build recipes, including the matched libquadmath source RPM. Keep replaceable shared libraries and recipients' modification/relinking rights intact. See `docs/digitization/OCR-PRODUCTION-REVIEW.md` and the machine manifest for the exact per-component inventory.

V: this package admission and authored-fixture validation are not a production deployment, country/property accuracy benchmark, independent legal or human/parity approval, or full digitization-engine release. The main release gate must continue refusing unfinished tasks. GPU validation remains deferred and VR remains paused.
