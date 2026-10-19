## Acceptance
Probe media codec/orientation and normalize thumbnails. Accepted after HE-B04 and HE-C03.
Minimum: Rotated supported clip renders upright; unsupported codec returns clear error.

## Implementation
Pinned static FFmpeg 7.1.5 probes supported H.264/HEVC/VP8/VP9 clips and produces upright canonical private thumbnails. Exact binary/source hashes, 40 build-package pins and complete upstream notices are checked. Landlock/seccomp restrict the single executable, files and pthread flags; network, fork and arbitrary execution stay denied. Private API execution checks actor, current input/source/version, lease and workflow before committing one pending quality-report thumbnail. Source bytes are freshly scanned and checksum verified. Unsupported codecs return MEDIA_CODEC_UNSUPPORTED. Replay is idempotent; successful runs await review. No publication or measurement approval is created.

## Tests
`docker compose -f services/property-processing/compose.tests.yaml run --rm --no-deps cpu python -m pytest -p no:cacheprovider -q tests` passes all 81 checks: media-verified-full-cpu-regressions.log. Nine native media checks include rotated quadrant pixel positions/colors, supported codecs, stripped metadata and confinement denials.
`./test-runner-protocol.sh media-probe` passes two real API/database/S3/Clam/native-worker journeys: media-verified-current-source-workflow.log. Changed bytes block commit; restored bytes succeed; replay produces one artifact; wrong fences and foreign scopes fail; unsupported codec produces no artifact.
Full units 142/46: media-verified-full-units-fixture-fixed.log. Nine types, lint, 374-operation contract consistency and compiled API 154 files pass. Six input-authority regressions and eight document/protocol checks pass. Native license/source gates pass. Local development readiness confirms mediaProbeAvailable=true with 10485760-byte maximum: media-development-enabled-readiness.log.

## Limitations
Private small-video profile only: 10 MiB transport cap, explicit codec/rotation/duration/dimension limits and aggregate decoder budget. Original large-capture receipts remain quarantined; legacy caps are unchanged. No authorized customer/country benchmark, physical device/headset, GPU, camera accuracy or production clearance. Initial missing-pthread build, dynamic-loader denial, missing fixture evidence and stale generated contracts are retained with corrected positive runs. The first readiness probe used the old port; corrected port8020 passes.

## Next dependency
HE-F02 frame extraction, HE-F05 browser capture, HE-F08 independent approved gallery and HE-G01 panorama validation remain separately gated.

## O
Self-authored CC0 RGB-quadrant clips and synthetic database actors only; actual encoded bytes, storage scans and native decoding.

## R
Preserved specification and Abu Dhabi priority; document-derived fixed fields remain empty when missing. Pinned upstream source https://ffmpeg.org/releases/ffmpeg-7.1.5.tar.xz. No invented parity approval.

## P
Actual implementation, confined builds, API integration and retained local tests described above.

## V
No human review, customer measurements, release completion or production deployment claimed.
