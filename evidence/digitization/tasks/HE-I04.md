# HE-I04 — Tier selection and observed scene performance

Status: in_progress; HE-I02 and named physical-device acceptance remain unfinished.

## Acceptance

Add tier selection and measured performance report. Exact minimum: document fps, memory and load bytes on named mobile/desktop devices. Emulation and the authored fixture do not satisfy this minimum.

## Implementation

Existing private tier selection now has a bounded stationary performance sampler in the shared scene renderer. It reports exact downloaded bytes, browser user-agent, drawing-buffer size/pixel ratio, first-render/download duration, observed RAF render cadence and p50/p95 frame intervals. Typed-array bytes and renderer object counts are explicitly separate from unknown GPU memory. The sample has frame/time caps, refuses hidden-tab/context-loss samples and cancels callbacks/timeouts on close/unmount/tier changes. No scene bytes, source IDs or private storage keys enter the report. The report remains scoped to the displayed private scene and is keyboard scrollable.

## Tests

`docker compose exec -T api pnpm exec vitest run tests/unit/digitization-scene-performance.test.ts` passes two checks for slow-frame tails and invalid/nonfinite/reversed samples (`scene-performance-unit-tests.log`). Actual browser report/cleanup/keyboard/accessibility evidence is produced by `./test-digitization-software.sh`, lane `scene-preview`, in `validation/software-scene-preview.log`. Final result must be read from that log. Report files: `scene-performance-desktop.json` and `scene-performance-mobile.json`.

Initial wrong emulated-user-agent assertion and actual keyboard scrollability failure are retained in `scene-performance-initial-browser-failure.log` and `scene-performance-initial-accessibility-failure.log`. Both implementation/assertion fixes are explicit; the failures are not counted as passes.

## Limitations

27 authored splats on Docker Chromium/SwiftShader, with mobile emulation. No physical-device performance, GPU-memory measure, trained reconstruction, moving-scene or headset acceptance. RAF cadence measures render submission including CPU sorting, not GPU completion time. Exact minimum verification remains empty.

## Next dependency

HE-I02 exact acceptance, named physical-device datasets/reports, then HE-K07 reference workload.

## O

Actual local browser callbacks, transferred authored binary bytes and renderer/typed-array observations.

## R

Preserved exact device acceptance, bounded tier selection, resource cleanup and honest measured quantities.

## P

Implemented sampler, security-preserving private content access and retained partial/final local checks.

## V

No device/headset/GPU/trained-scene or release acceptance inferred.
