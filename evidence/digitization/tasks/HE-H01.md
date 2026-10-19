# HE-H01 — pinned reconstruction CLI (in progress)

## Acceptance

Not accepted. The exact real small overlapping dataset minimum passes on CPU:16 selected TUM RGB-D cameras registered,3,102 actual sparse points. GPU build/runtime, API lease/artifact integration and scene review remain pending. No synthetic reconstruction substitute is used.

## Implementation

Pinned Python3.12.14/trixie digest, Debian COLMAP3.10-2,202 exact Debian package versions and actual SHA256 distribution hashes. Runtime install verifies each downloaded package identity/version/hash and the actual COLMAP binary SHA256.202 actual captured Debian copyright files are checksum-bound by the processing license gate. Optional Compose CLI profile has no network, credentials or host ports; readonly input, unprivileged UID10001,8GiB/2CPU/128PID caps. Bounded wrapper validates distinct prepared native PNG paths/hashes/dimensions, refuses extra/unlisted frames, mixed camera groups and public claims, then invokes fixed CPU feature extraction/sequential matching/mapping/text export with process-group deadline cleanup. API processing integration is still required; CLI output never creates artifacts/public receipts.

## Tests

- `BUILDX_BUILDER=default docker compose -f compose.yaml -f compose.reconstruction.yaml --profile reconstruction-smoke build processing-colmap-smoke` —CPU image builds with actual executable hash verification; evidence/digitization/colmap-pinned-cpu-corrected-build.log. Initial registry certificate/discovery and encoded-package filename failure logs retained. Default cached builder used without weakening TLS.
- `docker compose -f compose.yaml -f compose.reconstruction.yaml --profile reconstruction-smoke run --rm --no-deps processing-colmap-smoke` —real CPU reconstruction succeeds; evidence/digitization/colmap-real-camera-solve.log and colmap-real-camera-report.json. Actual16 registered cameras/3,102 points; no scale/depth/coverage claim.
- `docker compose -f compose.yaml -f compose.reconstruction.yaml --profile reconstruction-build run --rm --no-deps --volume ./services/property-processing:/test-code:ro --workdir /test-code --entrypoint python colmap-dependency-resolver -m unittest discover -s tests -p test_colmap_inputs.py` —3 input guard tests pass; evidence/digitization/colmap-input-guard-units.log.
- `docker compose exec -T api pnpm exec vitest run tests/unit/processing-licenses.test.ts` —11 license guards pass, including tampered COLMAP notices/dependency hash; evidence/digitization/colmap-license-guard-units.log.

The real one-second deadline invocation terminates the feature extraction process group with TimeoutExpired and emits no successful camera receipt; evidence/digitization/colmap-real-deadline-guard.log. Original timeout output retained.

## Limitations

CPU smoke is not GPU/stage/public package acceptance. Installed NVIDIA tools cannot communicate with a local driver. Hardware-dependent tasks remain unverified. Camera grouping beyond the single explicit clip is a later profile. Output scale and geometric coverage remain unknown; point count does not certify a complete property, metric dimensions or sensitive-content clearance. The real benchmark is an office research capture, not a customer Abu Dhabi dataset.

## Next dependency

Finish worker/CUDA isolation and required exact GPU image verification before accepting HE-H01 or advancing dependent reconstruction acceptance.

## O

Real licensed TUM RGB-D freiburg1_xyz RGB images, selected16-frame subset with unchanged pixels and deterministic names. Source/selected hashes and attribution in evidence/digitization/colmap-tum-xyz-fixture.json. Ground-truth/depth not used. Prior synthetic capture tests remain separate.

## R

Preserved specification §8 and pinned private reconstruction architecture. Official COLMAP installation/CLI references: https://colmap.github.io/install.html . Dataset/license source: https://cvg.cit.tum.de/data/datasets/rgbd-dataset (CC BY4.0; Sturm et al.,IROS2012). Abu Dhabi target does not alter this benchmark's actual origin.

## P

Actual local Compose CPU binary/package/source checks and real registered camera/point outputs. No speculative model metrics.

## V

GPU image/hardware, actual customer suitability, human/parity approval, headset, scene training/export and production/public package acceptance remain unverified.

## CUDA toolchain and publisher-license investigation — 10 October 2026 (P)

The smaller pinned CUDA12.6.3 base resolves and compiles with actual nvcc12.6.85;428 installed packages are inventoried (326 new/updated packages bound to signed-index hashes,102 inherited versions bound to the exact base image). Full devel-image pulls failed on repeated transport reset/timeout; those logs remain. This is dependency discovery, not an approved distributable GPU image.

The exact COLMAP3.10 source commit `0bd66d901c7549051e21e8f648777f802eb20a73` bundles a SiftGPU research/nonprofit restriction, while the actual Debian aggregate copyright labels that directory MIT. The conflict is unresolved. The exploratory CUDA COLMAP build was stopped before image export; the license gate rejects enabling COLMAP without a distribution review. Actual notices and conflict hashes are retained in `colmap-source-license-conflict.json`. A new CPU source investigation disables CUDA, OpenGL, CGAL and LSD and audits actual built objects and installed headers; the first audit correctly stopped when an IDE-only excluded target appeared in the complete compile-command inventory. No restricted component object had been built.

Pinned PopSift tagv0.9, commit `c8a669bce33db2525f6873a89c6d7c7434f93537`, source SHA `dffccd79e079f679eed2b11595dc6f2698c44b4f592580a0555d092e64e589c2`, compiles successfully for SM75/86/89. The actual emitted SONAME is `libpopsift.so.1.0.0` with SHA `6a13a90a83f823e5bab8782c767b9b6d4fb9e9980be36ac7c6709a4b968dc87c`. A retained MPL-2.0 source patch removes an unused cuBLAS link (no source calls found) and adds required explicit Thrust includes for CUDA12.6. Source notices and patch are checksum-bound as disabled investigations. No feature extraction or GPU runtime was executed.

Evidence: `popsift-cuda-complete-thrust-compile.log`, `popsift-compiled-library-report.json`, `popsift-source-investigation.json`, `ocr-popsift-final-license-guards.log`. Original configure/missing-header failures are retained. Publisher references: [COLMAP dependency license notice](https://colmap.github.io/license.html), [actual pinned SiftGPU license](https://github.com/colmap/colmap/blob/0bd66d901c7549051e21e8f648777f802eb20a73/src/thirdparty/SiftGPU/LICENSE), [pinned PopSift license](https://github.com/alicevision/popsift/blob/c8a669bce33db2525f6873a89c6d7c7434f93537/COPYING.md).

O: real publisher sources and actual local compiled binary. R: exact versions, commercial dependency review and no simulated reconstruction acceptance. P: actual cached isolated Compose toolchain and library build. V: GPU host/runtime, PopSift-to-COLMAP compatibility, source CPU investigation distribution admission and HE-H01 acceptance remain pending.

## Source CPU exclusion and real solve — 10 October 2026 (P)

The cached source CPU build succeeds with actual binary SHA `424e1a4a560165fbfb4ceca942aa307106db5b2ed5e3d6b7cb1e441a4a305e3f`. All145 actual built objects exclude SiftGPU/LSD; IDE-only excluded target entries are explicitly recorded separately and restricted installed headers are removed. Flags disable CUDA/OpenGL/LSD/CGAL. Actual reconstruction of the same licensed16 TUM views emits a largest model with16 registered cameras/3,088 points and a separate two-camera/512-point model. These are observed outputs, not parity with the earlier Debian solve, property completeness or metric scale.

Evidence: `colmap-source-cpu-built-object-exclusions-build.log`, `colmap-source-cpu-object-audit.json`, `colmap-source-cpu-real-camera-solve.log`, `colmap-source-cpu-real-camera-report.json`. The original complete-inventory assertion failure remains retained. The discovery/toolchain image still retains publisher source/build content and unresolved runtime distribution admission; it is not a production deployment artifact. A final runtime must exclude all restricted source/header/layer contents and retain exact dependency/source notices.

O: actual pinned source build and real licensed benchmark pixels. R: dependency exclusion, real reconstruction and unknown metric/coverage. P: actual compiled-object/installed-header audit and isolated CPU reconstruction. V: working GPU, GPU-feature adapter, clean production image admission and full HE-H01 acceptance remain pending.

## Current local continuation — 12 October 2026 (O/R/P/V)

O/P: Local CPU camera stages now traverse the durable API/queue/worker with immutable recipe/frame/source lineage, confinement, private calibrated export and review reports. The actual queued reference-derived clip registers16 views/3364 points; no metric scale, room coverage, physical property or GPU result is inferred. Recovery now describes47 tables in v6 while preserving historical versions; only the focused descriptor validation was rerun. Evidence: `colmap-confined-kernel-corrected-functional-validation.log`, `camera-durable-functional-validation.log`, `camera-queued-functional-journey.log`.

R/V: exact original acceptance and prerequisites remain mandatory. Production model/native admission, representative country/property/calibration inputs, physical GPU/headset, independent human/parity and current release/recovery gates remain unaccepted. Status stays in_progress; no whole-engine completion.
