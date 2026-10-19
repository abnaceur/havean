# HE-I07 — Accessibility and browser checks

Status: in_progress; HE-I01/HE-I05 and full plan/tour/device acceptance remain unfinished.

## Acceptance

Accessibility and supported-browser check. Exact minimum: keyboard plan/tour navigation, focus return and readable error states.

## Implementation

Added a serious/critical axe check scoped to the private reconstructed property panel, keyboard scrolling for the performance report, and panel overflow checks at 320/375/390/768/1440 widths. The report has a focusable named scroll region and wrapping text. Existing scene keyboard zoom/Home/reset/close and WebGL buffer release checks remain. `docs/digitization/TESTED-INPUTS-AND-DEVICES.md` distinguishes the actual Chromium engine from its emulated Safari user-agent and records unsupported physical device/browser claims.

## Tests

`./test-digitization-software.sh` runs the actual OIDC/scoped content/export/scene browser lane. Final evidence: `validation/software-scene-preview.log`; initial serious scrollable-region defect: `scene-performance-initial-accessibility-failure.log`. The defect is fixed without disabling the axe rule. Wider unit/type/lint results are retained separately under `validation/continuation-*`.

## Limitations

Panel-scoped accessibility checks are partial. They do not establish whole-app axe, full plan/tour focus-return, WebKit/Firefox, mobile hardware or physical WebXR acceptance. Exact minimum verification remains empty.

## Next dependency

Complete HE-I01/HE-I05, then the full keyboard plan/tour/focus/error and supported-browser matrix.

## O

Actual local Chromium DOM/keyboard/accessibility/overflow observations; authored scene fixture.

## R

Preserved full accessibility and browser acceptance; no emulated hardware approval.

## P

Implemented checks and corrected the observed keyboard defect.

## V

Full supported-browser, device/headset and release acceptance remain unfinished.

## Scene keyboard continuation — 10 October 2026

The private splat viewer now orbits with arrow keys around its bounded target, clamps pitch away from polar singularities, retains bounded zoom/Home reset, and closes with Escape while returning focus to the open-preview control. Removing the ineffective OrbitControls keyboard-pan listener avoids conflicting input. The actual browser test compares rendered canvas bytes after an arrow key, resets, interrupts a performance sample with Escape and checks focus/resource release. This remains partial I07 work: full plan/tour and supported browser/device acceptance/prerequisites remain open. Final observed evidence is recorded in PROGRESS.md. O: authored exported scene and actual Chromium keyboard/render/focus observations. R: exact keyboard/focus contract. P: implemented bounded orbit/close behavior. V: complete I07/browser/device/human acceptance absent.
