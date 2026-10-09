# HE-A02 — Inventory architecture and exact processing license foundation

## Acceptance
Inventory-owned ADR records existing API/worker/BFF/outbox/publication boundaries, explicit private grants and legacy geometry compatibility. Root license gate now covers exact Python wheel locks, processing Dockerfile and Compose service image digests, enabled model byte checksums and separate CUDA/GPU compatibility records. Baseline CPU image builds using verified wheels and runs unprivileged with bounded resources.

## Implementation
docs/adr/digitization.md, digitization-access.md, digitization-outbox.md; images.json/service-licenses.json/processing-dependencies.json; scripts/licenses.mjs and processing-licenses.mjs; services/property-processing/Dockerfile.cpu, compose.tests.yaml, download_wheels.py, locks/cpu.lock and test.lock; tests/unit/processing-licenses.test.ts.

Exact new image: Python 3.12.14 slim-trixie, sha256:78387bc3881b8273120a12ebe6c1ab22b018ccc2c9adf565ae1ac9b536e184ea, inspected immutable cached official image (Python 3.12.14, Debian 13). PyPI version metadata supplies exact wheel names/URLs/SHA-256 and SPDX records for pypdf 6.1.1, Pillow 11.3.0 and five pytest/transitive test packages. Binary hash-locked offline install and pip check enforce resolution. Compose build bootstrap verifies every cached/downloaded wheel; cache is ignored by Git. No model weights are enabled and GPU dependencies/services are explicitly unavailable until their own reviewed tasks.

## Tests
docker compose exec -T api pnpm exec vitest run tests/unit/processing-licenses.test.ts
Passed 7 CLI gate tests on 6 October 2026: missing license, altered wheel hash, floating lock, unmanifested Dockerfile and service image, incomplete GPU lock, missing model license/checksum/reason and actual model checksum mismatch.

docker compose exec -T api pnpm license:check
Passed: 42 existing npm packages, 10 pinned image records, 7 hash-locked processing packages, 0 enabled models, GPU unavailable.

docker compose -f services/property-processing/compose.tests.yaml run --rm wheel-download
Passed verification of all seven cached wheel bytes. Initial Docker registry/PyPI transfers timed out. Exact SHA-256 verified host-side source downloads completed the cache; no altered pins or unverified bytes were accepted.

docker compose -f services/property-processing/compose.tests.yaml build --builder default cpu
Passed CPU and CPU-test image build, offline --require-hashes installs and pip check. Test image manifest sha256:65607eb236eaf29da69b5ab422c61aab3bcd497eaa93924e7f616c79a3332d7a for this build.

docker compose -f services/property-processing/compose.tests.yaml run --rm cpu
Passed 14 pytest checks: real native PDF text with leading-zero ID, explicit OCR-required blank page, encryption/page/raster/invalid-document denials, all eight actual EXIF pixel transforms and identity/EXIF stripping.

./ci.sh
Frozen pnpm install passed in the live and stable isolated validation runs. Stable snapshot context is documented separately; this does not claim live workspace full CI passed.

## Limitations
This completes the initial licensing/build foundation, not OCR, asynchronous runner integration or reconstruction. There are no enabled OCR weights or country profiles. Native PDF inspection does not invent token boxes or claim OCR; empty pages require later OCR. Paddle/FFmpeg/COLMAP/gsplat/torch/CUDA/viewer/model/font/dataset records must be extended when those tasks add them. CPU image preflight explicitly reports OCR/reconstruction unavailable. GPU and real device gates remain pending. No production runner startup or HE-A05 acceptance is implied.

## Next dependency
HE-A03 schemas; HE-A04 migrations after current source maximum; HE-A05 runner Compose integration; HE-D02 and HE-H tasks add exact tested model/tool dependencies.

## O
No original reference capture.

## R
Supplied engine boundaries and primary exact PyPI/package/image license metadata. CPython license: https://github.com/python/cpython/blob/v3.12.14/LICENSE. Python image includes Debian third-party notices, not exclusively PSF licensing.

## P
Actual hash verification, Docker image installation and isolated real source-processing fixture tests. Fixtures are synthetic, not customer documents or reconstruction benchmark data.

## V
Real OCR/country benchmarks, GPU reconstruction, WebXR/performance, new visual approval and production remain unverified.

## CPU raster continuation — P
The pinned CPU build now contains eight recorded Python packages. PDFium 156.0.8076.0 (pypdfium2 5.14.0) has 18 checksum-bound upstream license/notice files retained under docs/adr/licenses; native decoder version/flags/library checksum are verified at runtime. Nine licensing plus nine ledger tests and license:check pass (validation/raster-licenses.log). Actual raster/normalization/import-shadowing coverage passes 47 CPU checks (validation/raster-cpu.log). The rebuilt API and CPU service are healthy and scoped API-to-runner readiness returns 200 after restoring the configured processing network via the digitization Compose override (validation/raster-runtime.log). This does not enable OCR or complete B04 engine eligibility.
