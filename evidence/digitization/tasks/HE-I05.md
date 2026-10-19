## User-requested pause — 12 October 2026 (O/R/P/V)

O/R: user explicitly requested pausing VR and commenting its UI. P: status is `paused`; the UI labels headset support paused and has no active immersive entry. Existing session-controller code and historical evidence are preserved. The structural viewer browser journey passes in `vr-pause-structural-functional-retry.log`, and `vr-pause-release-guard.log` verifies that pause cannot satisfy release. V: no headset/stereo/teleport acceptance; original task requirements and full release gate remain. Resume only when requested.

# HE-I05 — WebXR structural session lifecycle (in progress)

## Acceptance

Not accepted. The required physical supported-headset entry/exit check has not run; no headset connection has been supplied. Browser capability checks and synthetic lifecycle tests cannot satisfy that minimum.

## Implementation

The existing private structural GLB viewer uses the pinned Three0.186.1 XR manager, an actual browser immersive-VR capability query and a trusted click before `requestSession`. Rendering uses the XR animation loop only for an attached session and native view cameras. The source model remains the same private supplied-dimension structural preview, with no reconstructed-scene, metric-verification, public tour or teleport claim. Session entry is exclusive, rejected permissions/attachment failures preserve the normal preview, native exit restores controls/focus, and disposal ends late or active sessions. Late attachment is guarded against a closed/replaced scope; the renderer clears its animation loop and normal resize waits for XR session teardown. Model/network permission rules remain unchanged.

## Software checks

`webxr-structural-lifecycle-units.log`:4 lifecycle/race checks with explicit synthetic API doubles (unsupported/gesture denial, immediate exclusive entry/exit, late-session disposal, failed/late attachment cleanup). UI types pass. The final budgeted real native plan/browser regression passes2 native checks and16 desktop/mobile browser checks, including actual VR availability-button behavior and normal keyboard/room/canvas cleanup (`webxr-structural-budgeted-real-browser-workflow.log`). Earlier combined/paced runs hit the real shared request budget and are retained; the runner now splits projects into bounded batches with a60-second window between batches. The API limits remain enforced. No browser capability result is headset acceptance.

## O

Synthetic XR API doubles for lifecycle races; existing authored structural geometry for normal browser behavior. No physical headset or customer property evidence.

## R

Preserved HE-I05 minimum and private viewer integration. Primary interfaces: [WebXR Device API](https://immersive-web.github.io/webxr/), [Three WebXRManager](https://threejs.org/docs/pages/WebXRManager.html). Actual installed package types and source define the pinned API surface.

## P

Actual local Compose UI typecheck and4 unit checks. No emulated API is labeled hardware verification.

## V

Physical entry/exit, headset stereo/comfort/device matrix, camera anchors/teleport, splat VR, publication and full HE-I05 acceptance remain pending.
