# Inventory-owned digitization engine

Status: architecture accepted from the user's implementation contract; delivery
in progress. Source specification: ../digitization/specification.md. Inventory
owns engine tables, authority, drafts, decisions, geometry and immutable publication.
Existing API/worker boundaries, platform outbox, server-session BFF and existing
independent media/listing review remain. No second Node app, DB/queue/session store,
Codex runtime or paid reconstruction service.

## Execution and grants

API transactions are short checks/snapshots/dispatch/commit, never OCR/video/GPU/
object transfers. Worker coordinates an independent BullMQ digitization queue on
existing Valkey. PostgreSQL stages/leases/fences are authority; queue loss must
reconcile. Python CPU/GPU execution is isolated, authenticated and bounded, with
job-scoped source grants and no publication permission. See digitization-access.md
for preview versus explicit processing delegation. Search's workerActor is not an
engine identity. Runner SQLite execution records may support process reattachment;
they cannot replace API-owned workflow authority.

## Compatibility and truth

Legacy FloorLayout keeps required panorama/convex normalized coordinates and current
playback. legacy-digitization-geometry.ts is a one-way unverified snapshot adapter
with a right-handed Z-up conversion and tested Three.js inverse. It creates no
measured anchors/walls/openings/pose. Canonical v2 measured/estimated/unscaled
geometry and independently reviewed no-panorama plans use separate contracts. The v2 schema, triangulation and SVG/PNG/GLB components are implemented; editor, storage and independent new-asset review integration remain unfinished.
Gallery, panorama, structural and reconstructed scenes remain distinct. Content
scan/decoder approval differs from publication approval. Unknown facts stay unknown.

## Licensing and processing foundation

The CPU image pins Python 3.12.14 slim-trixie by actual registry digest; image
notice inventory is in images.json/service-licenses.json. CPython license source:
https://github.com/python/cpython/blob/v3.12.14/LICENSE. Debian base third-party
notices remain in the image; do not describe an entire image as exclusively PSF.
No extra OS codecs/CUDA packages are installed in this foundation. The immutable cached official image was inspected for Python 3.12.14 and Debian 13 trixie; the initial 3.12.12-bookworm registry pull stalled and was abandoned.

processing-dependencies.json records exact versions, SPDX metadata, source URLs,
Python requirements, upstream declared dependencies, approved wheel names/URLs and
SHA-256. cpu.lock/test.lock install only binary hash-locked Python 3.12 Linux/amd64
wheels, with real pip dependency resolution/pip check in image build. This baseline
supports pypdf native inspection and Pillow image orientation plus pytest; it is
not a working OCR/reconstruction runner. scripts/licenses.mjs invokes the new gate,
which validates all processing lockfiles, Dockerfile base images and added processing Compose service images. A new Python/
CUDA dependency, image or model must add exact records; enabled models require
licensed local bytes with matching SHA-256, no trusted manifest-only assertion.
Production runtime model downloads remain disabled. GPU is explicitly unavailable
until its separate lock, CUDA license/version, torch/gsplat records, image and
compatibility evidence are established.

PaddleOCR/weights, FFmpeg features, COLMAP/pycolmap, gsplat/torch/CUDA,
GaussianSplats3D and any Open3D/font/dataset transitive terms are still pending
exact integration and review. An upstream repository's permissive license does not
approve arbitrary weights/datasets/transitives. OpenSplat/research 3DGS/CubiCasa
are excluded pending distinct checks. No country profile enabled without its real
labeled benchmark. No GPU/device/performance acceptance inferred from CPU tests.

## Local verification

```sh
docker compose -f services/property-processing/compose.tests.yaml run --rm wheel-download
docker compose -f services/property-processing/compose.tests.yaml build --builder default cpu
docker compose -f services/property-processing/compose.tests.yaml run --rm cpu
docker compose exec -T api pnpm license:check
```

Build bootstrap downloads only source-manifest wheel URLs, verifies every SHA-256, and writes an ignored wheel cache; offline hash-locked image installs have no runtime fetch. Registry/PyPI timeouts initially delayed the build; verified host-side fetches completed the cache and the Compose bootstrap then rechecked all seven files. The test image subsequently built and passed 14 pytest cases. The build/test Compose has no infrastructure services or published ports, an
internal test network, nonroot/read-only/cap-drop/resource-limited execution.
It does not register a production runner or satisfy HE-A05 startup. The forthcoming
current-stack CPU/GPU override needs real internal execution API and reviewed
network/grant policies before activation.

O: no original capture. R: supplied engine architecture and primary package/image
license metadata. P: actual local dependency/build/source tests. V: OCR, GPU,
new screens, country accuracy, device performance and production unverified.

## Current CPU execution and isolation

The initial foundation above has advanced to real checksum-pinned PDFium rasterization, native glyph evidence, authenticated durable execution receipts and source/private-preview transfer. The current targeted CPU lane passes 66 tests and the real Node/Python transport lane passes one journey. Default current-stack execution remains disabled without explicit private key/root configuration; OCR/reconstruction remain unavailable. See digitization-decoder-isolation.md for mandatory Landlock/seccomp rules, supported-host policy and key mount boundaries. This is not an R1 OCR draft or full coordinator acceptance.
